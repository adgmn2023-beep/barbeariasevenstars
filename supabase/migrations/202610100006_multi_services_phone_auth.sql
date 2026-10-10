begin;

-- Snapshot de cada serviço; valores históricos nunca dependem do catálogo atual.
create table public.appointment_services (
 id uuid primary key default gen_random_uuid(),
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 service_id uuid references public.services(id) on delete set null,
 name text not null,
 price numeric(10,2) not null check(price>=0),
 duration_minutes int not null check(duration_minutes>0),
 unique(appointment_id,service_id)
);
insert into public.appointment_services(appointment_id,service_id,name,price,duration_minutes)
select id,service_id,service_name,price,duration_minutes from public.appointments;
alter table public.appointment_services enable row level security;
create policy appointment_services_read on public.appointment_services for select to authenticated
 using(exists(select 1 from public.appointments a where a.id=appointment_id));
revoke all on public.appointment_services from public,anon,authenticated;
grant select on public.appointment_services to authenticated;
grant all on public.appointment_services to service_role;
create function public.guard_appointment_service() returns trigger language plpgsql set search_path=public as $$ begin
 if (to_jsonb(new)-'service_id') is distinct from (to_jsonb(old)-'service_id')
   or (new.service_id is distinct from old.service_id and new.service_id is not null) then
   raise exception 'O histórico dos serviços não pode ser alterado.';
 end if;
 return new;
end $$;
create trigger appointment_service_guard before update on public.appointment_services
 for each row execute function public.guard_appointment_service();

-- Auxiliar só do servidor: compatível com telefones legados formatados.
create function public.normalize_client_phone(value text) returns text
language sql immutable set search_path=public as $$
 select case when length(d) in (12,13) and left(d,2)='55' then substr(d,3) else d end
 from (select regexp_replace(coalesce(value,''),'\D','','g') d) cleaned
$$;
create index profiles_phone_lookup on public.profiles(public.normalize_client_phone(telefone));
create unique index profiles_technical_phone_unique on public.profiles(public.normalize_client_phone(telefone))
 where email like '%@clientes.sevenstars.invalid';
create function public.find_client_by_phone(p_phone text)
returns table(id uuid,email text) language sql stable security definer set search_path=public as $$
 select p.id,p.email from public.profiles p
 where p.role='client' and public.normalize_client_phone(p.telefone)=public.normalize_client_phone(p_phone)
 order by p.created_at,p.id limit 2
$$;
-- O telefone de login não pode divergir da identidade técnica do Auth.
create function public.guard_client_login_phone() returns trigger language plpgsql set search_path=public as $$ begin
 if current_user in ('authenticated','anon')
   and old.email like '%@clientes.sevenstars.invalid'
   and public.normalize_client_phone(new.telefone) is distinct from public.normalize_client_phone(old.telefone) then
   raise exception 'Para alterar o telefone de acesso, fale com a barbearia.';
 end if;
 return new;
end $$;
create trigger client_login_phone_guard before update of telefone on public.profiles
 for each row execute function public.guard_client_login_phone();

-- Limitação persistente, compartilhada entre instâncias. Só hashes HMAC e contadores.
create table public.auth_rate_limits (
 bucket text primary key check(bucket ~ '^[a-f0-9]{64}$'),
 attempts int not null check(attempts>0),
 window_start timestamptz not null default now()
);
alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from public,anon,authenticated;
grant all on public.auth_rate_limits to service_role;
create function public.consume_auth_rate_limit(p_bucket text,p_limit int,p_window_seconds int)
returns boolean language plpgsql security definer set search_path=public as $$
declare count_attempts int;
begin
 if p_limit not between 1 and 100 or p_window_seconds not between 60 and 86400 then
   raise exception 'Limite de tentativas inválido.';
 end if;
 delete from public.auth_rate_limits where window_start<now()-interval '1 day';
 insert into public.auth_rate_limits as limits(bucket,attempts,window_start) values(p_bucket,1,now())
 on conflict(bucket) do update set
 attempts=case when limits.window_start<=now()-make_interval(secs=>p_window_seconds) then 1 else least(limits.attempts+1,p_limit+1) end,
 window_start=case when limits.window_start<=now()-make_interval(secs=>p_window_seconds) then now() else limits.window_start end
 returning attempts into count_attempts;
 return count_attempts<=p_limit;
end $$;

create function public.create_appointment(p_service_ids uuid[],p_start_at timestamptz,p_barber_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  total_price numeric;
  total_duration int;
  service_names text;
  selected_count int;
  h public.business_hours;
  cfg public.settings;
  p public.profiles;
  local_start timestamp;
  local_end timestamp;
  finish timestamptz;
  result uuid;
  chosen_barber uuid;
begin
  perform pg_advisory_xact_lock(777001);
  if auth.uid() is null then raise exception 'Entre na sua conta para agendar.'; end if;
  if p_start_at is null then raise exception 'Selecione um horário.'; end if;
  select * into p from public.profiles where id=auth.uid();
  if length(coalesce(p.nome,''))<2
    or length(regexp_replace(coalesce(p.telefone,''),'\D','','g')) not between 10 and 11
    or p.privacy_accepted_at is null then
    raise exception 'Complete seu cadastro antes de agendar.';
  end if;
  if p.must_change_password then raise exception 'Troque sua senha provisória antes de agendar.'; end if;
  if coalesce(cardinality(p_service_ids),0) not between 1 and 20
    or exists(select 1 from unnest(p_service_ids) x where x is null)
    or (select count(distinct x) from unnest(p_service_ids) x)<>cardinality(p_service_ids) then
    raise exception 'Escolha de 1 a 20 serviços diferentes.';
  end if;
  perform 1 from public.services where id=any(p_service_ids) order by id for share;
  select count(*),sum(price),sum(duration_minutes),string_agg(name,' + ' order by array_position(p_service_ids,id))
    into selected_count,total_price,total_duration,service_names
    from public.services where id=any(p_service_ids) and active;
  if selected_count<>cardinality(p_service_ids) then raise exception 'Serviço indisponível.'; end if;
  select * into cfg from public.settings where id=1;
  local_start:=p_start_at at time zone 'America/Sao_Paulo';
  finish:=p_start_at+make_interval(mins=>total_duration);
  local_end:=finish at time zone 'America/Sao_Paulo';
  if p_start_at<now()+make_interval(mins=>cfg.min_notice)
    or local_start::date>(now() at time zone 'America/Sao_Paulo')::date+cfg.booking_window then
    raise exception 'Horário fora da antecedência ou da janela permitida.';
  end if;
  select * into h from public.business_hours where weekday=extract(dow from local_start)::int;
  if not found or h.closed or local_start::date<>local_end::date
    or local_start::time<h.opens or local_end::time>h.closes
    or extract(epoch from (local_start::time-h.opens)) % (cfg.slot_step*60)<>0 then
    raise exception 'Horário fora do expediente ou da grade.';
  end if;
  if h.lunch_start is not null and local_start::time<h.lunch_end and local_end::time>h.lunch_start then
    raise exception 'Horário reservado para almoço.';
  end if;

  if p_barber_id is not null then
    select b.id into chosen_barber from public.barbers b where b.id=p_barber_id and b.active;
    if not found then raise exception 'Barbeiro indisponível.'; end if;
    if exists(
      select 1 from public.appointments a
      where a.barber_id=chosen_barber and a.status in ('pendente','confirmado','concluido')
        and tstzrange(a.start_at,a.end_at,'[)') && tstzrange(p_start_at,finish,'[)')
    ) or exists(
      select 1 from public.blocked_slots b
      where (b.barber_id is null or b.barber_id=chosen_barber)
        and tstzrange(b.start_at,b.end_at,'[)') && tstzrange(p_start_at,finish,'[)')
    ) then raise exception 'Esse horário acabou de ser ocupado, escolha outro.'; end if;
  else
    select b.id into chosen_barber
    from public.barbers b
    where b.active
      and not exists(
        select 1 from public.appointments a
        where a.barber_id=b.id and a.status in ('pendente','confirmado','concluido')
          and tstzrange(a.start_at,a.end_at,'[)') && tstzrange(p_start_at,finish,'[)')
      )
      and not exists(
        select 1 from public.blocked_slots x
        where (x.barber_id is null or x.barber_id=b.id)
          and tstzrange(x.start_at,x.end_at,'[)') && tstzrange(p_start_at,finish,'[)')
      )
    order by (
      select count(*) from public.appointments a
      where a.barber_id=b.id and a.booking_date=local_start::date
        and a.status in ('pendente','confirmado','concluido')
    ),b.id
    limit 1;
    if not found then raise exception 'Esse horário acabou de ser ocupado, escolha outro.'; end if;
  end if;

  insert into public.appointments(
    client_id,service_id,barber_id,service_name,price,duration_minutes,start_at,end_at,booking_date
  ) values(
    auth.uid(),case when cardinality(p_service_ids)=1 then p_service_ids[1] else null end,chosen_barber,service_names,total_price,total_duration,p_start_at,finish,local_start::date
  ) returning id into result;
  insert into public.appointment_services(appointment_id,service_id,name,price,duration_minutes)
  select result,id,name,price,duration_minutes from public.services where id=any(p_service_ids);
  return result;
exception
  when exclusion_violation then raise exception 'Esse horário acabou de ser ocupado, escolha outro.';
  when unique_violation then raise exception 'Você já tem um agendamento neste dia. Para levar um amigo, ele precisa ter a própria conta.';
end $$;


-- Assinatura legada delega à função de múltiplos serviços.
create or replace function public.create_appointment(p_service_id uuid,p_start_at timestamptz,p_barber_id uuid default null)
returns uuid language sql security definer set search_path=public as $$
 select public.create_appointment(array[p_service_id],p_start_at,p_barber_id)
$$;
revoke all on function public.create_appointment(uuid[],timestamptz,uuid) from public,anon;
revoke all on function public.create_appointment(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.create_appointment(uuid[],timestamptz,uuid),public.create_appointment(uuid,timestamptz,uuid) to authenticated;
revoke all on function public.find_client_by_phone(text),public.consume_auth_rate_limit(text,int,int),public.guard_appointment_service(),public.guard_client_login_phone() from public,anon,authenticated;
grant execute on function public.find_client_by_phone(text),public.consume_auth_rate_limit(text,int,int) to service_role;
commit;
