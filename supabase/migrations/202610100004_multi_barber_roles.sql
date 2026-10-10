begin;

create extension if not exists btree_gist;

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role='master' where role='admin';
alter table public.profiles alter column role set default 'client';
alter table public.profiles add constraint profiles_role_check check(role in ('client','barber','admin','master'));

create table public.barbers(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id),
  display_name text not null check(length(trim(display_name))>=2),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.barbers enable row level security;
create function public.guard_barber_profile() returns trigger
language plpgsql security definer set search_path=public as $$
declare linked_role text;
begin
  select p.role into linked_role from public.profiles p where p.id=new.profile_id;
  if linked_role not in ('barber','admin','master') then
    raise exception 'O perfil vinculado precisa ser barbeiro, admin ou master.';
  end if;
  return new;
end $$;
create trigger barber_profile_guard before insert or update of profile_id on public.barbers
  for each row execute function public.guard_barber_profile();

alter table public.appointments add column barber_id uuid references public.barbers(id);
update public.appointments a
set barber_id=(select b.id from public.barbers b where b.active order by b.id limit 1)
where a.barber_id is null;
create index appointments_barber_day on public.appointments(barber_id,booking_date);
do $$ begin
  if not exists(select 1 from public.appointments where barber_id is null) then
    alter table public.appointments alter column barber_id set not null;
  end if;
end $$;
create function public.assign_unlinked_appointments() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  if new.active then
    perform pg_advisory_xact_lock(777001);
    update public.appointments a set barber_id=new.id where a.barber_id is null;
  end if;
  return new;
end $$;
create trigger barber_assign_legacy_appointments after insert or update of active on public.barbers
  for each row execute function public.assign_unlinked_appointments();
alter table public.appointments drop constraint if exists appointments_tstzrange_excl;
alter table public.appointments drop constraint if exists appointments_barber_time_excl;
alter table public.appointments add constraint appointments_barber_time_excl
  exclude using gist(barber_id with =,tstzrange(start_at,end_at,'[)') with &&)
  where(status in ('pendente','confirmado','concluido'));

alter table public.blocked_slots add column barber_id uuid references public.barbers(id);
create index blocked_slots_barber_time on public.blocked_slots(barber_id,start_at,end_at);

create or replace function public.is_admin_or_master() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','master'))
$$;
create or replace function public.is_master() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='master')
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in ('barber','admin','master'))
$$;
create or replace function public.current_barber_id() returns uuid
language sql stable security definer set search_path=public as $$
  select b.id from public.barbers b where b.profile_id=auth.uid() limit 1
$$;
create or replace function public.is_barber() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='barber')
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_admin_or_master()
$$;

create or replace function public.guard_profile() returns trigger
language plpgsql set search_path=public as $$ begin
  if current_user in ('authenticated','anon') then
    if new.role is distinct from old.role and not public.is_master() then
      if old.role in ('admin','master') or new.role in ('admin','master') then
        raise exception 'Somente master pode alterar os papéis admin e master.';
      end if;
      if old.role not in ('client','barber') or new.role not in ('client','barber')
        or not public.is_admin_or_master() then
        raise exception 'Não é permitido alterar permissões.';
      end if;
    end if;
    if (new.email is distinct from old.email or new.id is distinct from old.id)
      and not public.is_admin_or_master() then
      raise exception 'Não é permitido alterar a identidade.';
    end if;
  end if;
  if exists(select 1 from public.barbers b where b.profile_id=old.id)
    and new.role='client' then
    raise exception 'Desative o vínculo de barbeiro antes de alterar o papel.';
  end if;
  return new;
end $$;

create or replace function public.guard_appointment() returns trigger
language plpgsql set search_path=public as $$ begin
  if (to_jsonb(new)-array['status','cancel_reason','client_id','service_id','barber_id'])
    is distinct from (to_jsonb(old)-array['status','cancel_reason','client_id','service_id','barber_id']) then
    raise exception 'O histórico do agendamento não pode ser alterado.';
  end if;
  if new.client_id is distinct from old.client_id and new.client_id is not null then
    raise exception 'Cliente não pode ser alterado.';
  end if;
  if new.service_id is distinct from old.service_id and new.service_id is not null then
    raise exception 'Serviço não pode ser alterado.';
  end if;
  if new.status is distinct from old.status and not (
    (old.status='pendente' and new.status in ('confirmado','cancelado')) or
    (old.status='confirmado' and new.status in ('concluido','faltou') and old.end_at<=now())
  ) then raise exception 'Mudança de status não permitida.'; end if;
  return new;
end $$;

create or replace function public.lock_schedule() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform pg_advisory_xact_lock(777001);
  if tg_table_name='blocked_slots' then
    if exists(
      select 1 from public.appointments a
      where a.status in ('pendente','confirmado','concluido')
        and (new.barber_id is null or a.barber_id=new.barber_id)
        and tstzrange(a.start_at,a.end_at,'[)') && tstzrange(new.start_at,new.end_at,'[)')
    ) then raise exception 'O bloqueio conflita com um agendamento existente.'; end if;
  end if;
  return new;
end $$;

drop function if exists public.create_appointment(uuid,timestamptz);
create function public.create_appointment(p_service_id uuid,p_start_at timestamptz,p_barber_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  s public.services;
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
    or p.data_nascimento is null or p.data_nascimento>current_date
    or p.privacy_accepted_at is null then
    raise exception 'Complete seu cadastro antes de agendar.';
  end if;
  select * into s from public.services where id=p_service_id and active;
  if not found then raise exception 'Serviço indisponível.'; end if;
  select * into cfg from public.settings where id=1;
  local_start:=p_start_at at time zone 'America/Sao_Paulo';
  finish:=p_start_at+make_interval(mins=>s.duration_minutes);
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
    auth.uid(),s.id,chosen_barber,s.name,s.price,s.duration_minutes,p_start_at,finish,local_start::date
  ) returning id into result;
  return result;
exception
  when exclusion_violation then raise exception 'Esse horário acabou de ser ocupado, escolha outro.';
  when unique_violation then raise exception 'Você já tem um agendamento neste dia. Para levar um amigo, ele precisa ter a própria conta.';
end $$;

drop function if exists public.get_busy_ranges(date);
create function public.get_busy_ranges(p_date date,p_barber_id uuid default null)
returns table(start_at timestamptz,end_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if p_barber_id is not null then
    return query
      select a.start_at,a.end_at from public.appointments a
      where a.barber_id=p_barber_id and a.status in ('pendente','confirmado','concluido') and a.booking_date=p_date
      union all
      select b.start_at,b.end_at from public.blocked_slots b
      where (b.barber_id is null or b.barber_id=p_barber_id)
        and b.start_at<((p_date+1)::timestamp at time zone 'America/Sao_Paulo')
        and b.end_at>(p_date::timestamp at time zone 'America/Sao_Paulo');
    return;
  end if;
  return query
    with active_barbers as (
      select b.id from public.barbers b where b.active
    ), busy as (
      select a.barber_id,a.start_at as busy_start,a.end_at as busy_end
      from public.appointments a join active_barbers ab on ab.id=a.barber_id
      where a.status in ('pendente','confirmado','concluido') and a.booking_date=p_date
      union all
      select ab.id,b.start_at,b.end_at
      from public.blocked_slots b cross join active_barbers ab
      where b.barber_id is null
        and b.start_at<((p_date+1)::timestamp at time zone 'America/Sao_Paulo')
        and b.end_at>(p_date::timestamp at time zone 'America/Sao_Paulo')
      union all
      select b.barber_id,b.start_at,b.end_at
      from public.blocked_slots b join active_barbers ab on ab.id=b.barber_id
      where b.start_at<((p_date+1)::timestamp at time zone 'America/Sao_Paulo')
        and b.end_at>(p_date::timestamp at time zone 'America/Sao_Paulo')
    ), boundaries as (
      select busy_start as point from busy
      union
      select busy_end from busy
    ), segments as (
      select point as segment_start,lead(point) over(order by point) as segment_end from boundaries
    )
    select s.segment_start,s.segment_end
    from segments s
    where s.segment_end is not null
      and exists(select 1 from active_barbers)
      and not exists(
        select 1 from active_barbers ab
        where not exists(
          select 1 from busy b
          where b.barber_id=ab.id and b.busy_start<=s.segment_start and b.busy_end>=s.segment_end
        )
      )
    order by s.segment_start;
end $$;

create function public.list_active_barbers()
returns table(id uuid,display_name text)
language sql stable security definer set search_path=public as $$
  select b.id,b.display_name from public.barbers b where b.active order by b.display_name,b.id
$$;

create function public.deactivate_barber(barber_id uuid,reassign_to uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare
  target_barber_id uuid := $1;
  destination_barber_id uuid := $2;
begin
  if not public.is_admin_or_master() then raise exception 'Apenas admin ou master pode desativar barbeiros.'; end if;
  perform pg_advisory_xact_lock(777001);
  if not exists(select 1 from public.barbers b where b.id=target_barber_id and b.active) then
    raise exception 'Barbeiro ativo não encontrado.';
  end if;
  if destination_barber_id is not null and (
    destination_barber_id=target_barber_id or not exists(select 1 from public.barbers b where b.id=destination_barber_id and b.active)
  ) then raise exception 'Escolha outro barbeiro ativo para remanejar os agendamentos.'; end if;
  if exists(
    select 1 from public.appointments a
    where a.barber_id=target_barber_id
      and a.status in ('pendente','confirmado') and a.start_at>now()
  ) and destination_barber_id is null then
    raise exception 'Remaneje ou cancele os agendamentos futuros pendentes/confirmados antes de desativar.';
  end if;
  if destination_barber_id is not null and exists(
    select 1 from public.appointments source
    join public.appointments target on target.barber_id=destination_barber_id
      and target.status in ('pendente','confirmado','concluido')
      and tstzrange(source.start_at,source.end_at,'[)') && tstzrange(target.start_at,target.end_at,'[)')
    where source.barber_id=target_barber_id
      and source.status in ('pendente','confirmado') and source.start_at>now()
  ) then raise exception 'O barbeiro de destino já tem conflito nesse horário.'; end if;
  if destination_barber_id is not null and exists(
    select 1 from public.appointments source join public.blocked_slots block
      on (block.barber_id is null or block.barber_id=destination_barber_id)
      and tstzrange(source.start_at,source.end_at,'[)') && tstzrange(block.start_at,block.end_at,'[)')
    where source.barber_id=target_barber_id
      and source.status in ('pendente','confirmado') and source.start_at>now()
  ) then raise exception 'O horário remanejado conflita com um bloqueio.'; end if;
  if destination_barber_id is not null then
    update public.appointments a set barber_id=destination_barber_id
    where a.barber_id=target_barber_id
      and a.status in ('pendente','confirmado') and a.start_at>now();
  end if;
  update public.barbers set active=false where id=target_barber_id;
end $$;

drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using(
    id=auth.uid()
    or public.is_admin_or_master()
    or (
      role='client' and exists(
        select 1 from public.appointments a
        where a.client_id=profiles.id and a.barber_id=public.current_barber_id()
      )
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using(id=auth.uid() or public.is_admin_or_master())
  with check(id=auth.uid() or public.is_admin_or_master());

drop policy if exists services_read on public.services;
drop policy if exists services_admin on public.services;
create policy services_read on public.services for select
  using(active or public.is_admin_or_master());
create policy services_admin on public.services for all to authenticated
  using(public.is_admin_or_master()) with check(public.is_admin_or_master());

drop policy if exists hours_read on public.business_hours;
drop policy if exists hours_admin on public.business_hours;
create policy hours_read on public.business_hours for select using(true);
create policy hours_admin on public.business_hours for all to authenticated
  using(public.is_admin_or_master()) with check(public.is_admin_or_master());

drop policy if exists settings_read on public.settings;
drop policy if exists settings_admin on public.settings;
create policy settings_read on public.settings for select to anon,authenticated
  using(not public.is_barber());
create policy settings_admin on public.settings for all to authenticated
  using(public.is_admin_or_master()) with check(public.is_admin_or_master());

drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated
  using(client_id=auth.uid() or barber_id=public.current_barber_id() or public.is_admin_or_master());
drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments for update to authenticated
  using(barber_id=public.current_barber_id() or public.is_admin_or_master())
  with check(barber_id=public.current_barber_id() or public.is_admin_or_master());

drop policy if exists blocks_admin on public.blocked_slots;
create policy blocks_manage on public.blocked_slots for all to authenticated
  using(barber_id=public.current_barber_id() or public.is_admin_or_master())
  with check(barber_id=public.current_barber_id() or public.is_admin_or_master());

create policy barbers_admin on public.barbers for all to authenticated
  using(public.is_admin_or_master()) with check(public.is_admin_or_master());

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());

revoke all on public.profiles,public.services,public.appointments,public.blocked_slots,
  public.business_hours,public.settings,public.push_subscriptions,public.barbers
  from anon,authenticated;
grant select on public.services,public.business_hours,public.settings to anon,authenticated;
grant select,update(nome,telefone,data_nascimento,privacy_accepted_at,role) on public.profiles to authenticated;
grant select,update(status,cancel_reason) on public.appointments to authenticated;
grant select,insert,update,delete on public.blocked_slots,public.push_subscriptions to authenticated;
grant select,insert,update on public.barbers to authenticated;
grant insert,update,delete on public.services,public.business_hours,public.settings to authenticated;
grant all on public.profiles,public.services,public.appointments,public.blocked_slots,
  public.business_hours,public.settings,public.push_subscriptions,public.barbers to service_role;

revoke all on function public.is_staff() from public,anon,authenticated;
revoke all on function public.is_admin_or_master() from public,anon,authenticated;
revoke all on function public.is_master() from public,anon,authenticated;
revoke all on function public.current_barber_id() from public,anon,authenticated;
revoke all on function public.is_barber() from public,anon,authenticated;
revoke all on function public.is_admin() from public,anon,authenticated;
revoke all on function public.create_appointment(uuid,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.get_busy_ranges(date,uuid) from public,anon,authenticated;
revoke all on function public.list_active_barbers() from public,anon,authenticated;
revoke all on function public.deactivate_barber(uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin_or_master() to authenticated;
grant execute on function public.is_master() to authenticated;
grant execute on function public.current_barber_id() to authenticated;
grant execute on function public.is_barber() to anon,authenticated;
grant execute on function public.is_admin_or_master() to anon;
grant execute on function public.is_admin() to anon,authenticated;
grant execute on function public.create_appointment(uuid,timestamptz,uuid) to authenticated;
grant execute on function public.get_busy_ranges(date,uuid) to anon,authenticated;
grant execute on function public.list_active_barbers() to anon,authenticated;
grant execute on function public.deactivate_barber(uuid,uuid) to authenticated;
grant execute on function public.erase_account_data(uuid) to service_role;

do $$ begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='appointments'
  ) then alter publication supabase_realtime add table public.appointments; end if;
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='blocked_slots'
  ) then alter publication supabase_realtime add table public.blocked_slots; end if;
end $$;

commit;