create extension if not exists btree_gist;
create table public.profiles(id uuid primary key references auth.users on delete cascade,nome text not null default '',telefone text,email text,data_nascimento date,privacy_accepted_at timestamptz,role text not null default 'client' check(role in ('client','admin')),created_at timestamptz not null default now());
create table public.services(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name))>=2),price numeric(10,2) not null check(price>=0),duration_minutes int not null check(duration_minutes between 5 and 600),active boolean not null default true);
create table public.business_hours(weekday int primary key check(weekday between 0 and 6),closed boolean not null default false,opens time not null,closes time not null,lunch_start time,lunch_end time,check(opens<closes),check((lunch_start is null and lunch_end is null) or (lunch_start is not null and lunch_end is not null and lunch_start<lunch_end and lunch_start>=opens and lunch_end<=closes)));
create table public.settings(id int primary key default 1 check(id=1),slot_step int not null default 20 check(slot_step between 5 and 120),min_notice int not null default 30 check(min_notice between 0 and 10080),booking_window int not null default 30 check(booking_window between 1 and 365));
create table public.appointments(id uuid primary key default gen_random_uuid(),client_id uuid references public.profiles on delete set null,service_id uuid references public.services on delete set null,service_name text not null,price numeric(10,2) not null check(price>=0),duration_minutes int not null check(duration_minutes>0),start_at timestamptz not null,end_at timestamptz not null,booking_date date not null,status text not null default 'pendente' check(status in ('pendente','confirmado','cancelado','concluido','faltou')),cancel_reason text,created_at timestamptz not null default now(),check(end_at>start_at),check(status<>'cancelado' or (cancel_reason is not null and length(trim(cancel_reason))>=3)),exclude using gist(tstzrange(start_at,end_at,'[)') with &&) where(status in ('pendente','confirmado','concluido')));
create unique index one_client_per_day on public.appointments(client_id,booking_date) where(status in ('pendente','confirmado','concluido'));
create index appointments_day on public.appointments(booking_date);
create table public.blocked_slots(id uuid primary key default gen_random_uuid(),start_at timestamptz not null,end_at timestamptz not null,reason text,check(end_at>start_at));
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,endpoint text not null unique,p256dh text not null,auth text not null,created_at timestamptz not null default now());
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;
create function public.on_signup() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into profiles(id,nome,telefone,email,data_nascimento,privacy_accepted_at) values(new.id,coalesce(new.raw_user_meta_data->>'nome',new.raw_user_meta_data->>'full_name',''),new.raw_user_meta_data->>'telefone',new.email,nullif(new.raw_user_meta_data->>'data_nascimento','')::date,case when new.raw_user_meta_data->>'privacy_accepted'='true' then now() end);return new;end $$;
create trigger auth_signup after insert on auth.users for each row execute function public.on_signup();
create function public.guard_profile() returns trigger language plpgsql set search_path=public as $$ begin
 if current_user in ('authenticated','anon') and (new.role is distinct from old.role or new.email is distinct from old.email or new.id is distinct from old.id) then raise exception 'Não é permitido alterar permissões ou identidade.';end if;return new;end $$;
create trigger profile_guard before update on public.profiles for each row execute function public.guard_profile();
create function public.guard_appointment() returns trigger language plpgsql set search_path=public as $$ begin
 if (to_jsonb(new)-array['status','cancel_reason','client_id','service_id']) is distinct from (to_jsonb(old)-array['status','cancel_reason','client_id','service_id']) then raise exception 'O histórico do agendamento não pode ser alterado.';end if;
 if new.client_id is distinct from old.client_id and new.client_id is not null then raise exception 'Cliente não pode ser alterado.';end if;
 if new.service_id is distinct from old.service_id and new.service_id is not null then raise exception 'Serviço não pode ser alterado.';end if;
 if new.status is distinct from old.status and not ((old.status='pendente' and new.status in ('confirmado','cancelado')) or (old.status='confirmado' and new.status in ('concluido','faltou') and old.end_at<=now())) then raise exception 'Mudança de status não permitida.';end if;return new;end $$;
create trigger appointment_guard before update on public.appointments for each row execute function public.guard_appointment();
create function public.lock_schedule() returns trigger language plpgsql set search_path=public as $$ begin
 perform pg_advisory_xact_lock(777001);
 if tg_table_name='blocked_slots' then
 if exists(select 1 from appointments where status in ('pendente','confirmado','concluido') and tstzrange(start_at,end_at,'[)') && tstzrange(new.start_at,new.end_at,'[)')) then raise exception 'O bloqueio conflita com um agendamento existente.';end if;end if;return new;end $$;
create trigger block_guard before insert or update on public.blocked_slots for each row execute function public.lock_schedule();
create trigger hours_lock before insert or update on public.business_hours for each row execute function public.lock_schedule();
create trigger settings_lock before update on public.settings for each row execute function public.lock_schedule();
create function public.create_appointment(p_service_id uuid,p_start_at timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare s services;h business_hours;cfg settings;p profiles;local_start timestamp;local_end timestamp;finish timestamptz;result uuid;
begin
 perform pg_advisory_xact_lock(777001);
 if auth.uid() is null then raise exception 'Entre na sua conta para agendar.';end if;
 if p_start_at is null then raise exception 'Selecione um horário.';end if;
 select * into p from profiles where id=auth.uid();
 if length(coalesce(p.nome,''))<2 or length(regexp_replace(coalesce(p.telefone,''),'\D','','g')) not between 10 and 11 or p.data_nascimento is null or p.data_nascimento>current_date or p.privacy_accepted_at is null then raise exception 'Complete seu cadastro antes de agendar.';end if;
 select * into s from services where id=p_service_id and active;if not found then raise exception 'Serviço indisponível.';end if;
 select * into cfg from settings where id=1;
 local_start:=p_start_at at time zone 'America/Sao_Paulo';finish:=p_start_at+make_interval(mins=>s.duration_minutes);local_end:=finish at time zone 'America/Sao_Paulo';
 if p_start_at<now()+make_interval(mins=>cfg.min_notice) or local_start::date>(now() at time zone 'America/Sao_Paulo')::date+cfg.booking_window then raise exception 'Horário fora da antecedência ou da janela permitida.';end if;
 select * into h from business_hours where weekday=extract(dow from local_start)::int;
 if not found or h.closed or local_start::date<>local_end::date or local_start::time<h.opens or local_end::time>h.closes or extract(epoch from (local_start::time-h.opens)) % (cfg.slot_step*60)<>0 then raise exception 'Horário fora do expediente ou da grade.';end if;
 if h.lunch_start is not null and local_start::time<h.lunch_end and local_end::time>h.lunch_start then raise exception 'Horário reservado para almoço.';end if;
 if exists(select 1 from blocked_slots where tstzrange(start_at,end_at,'[)') && tstzrange(p_start_at,finish,'[)')) then raise exception 'Este horário está bloqueado.';end if;
 insert into appointments(client_id,service_id,service_name,price,duration_minutes,start_at,end_at,booking_date) values(auth.uid(),s.id,s.name,s.price,s.duration_minutes,p_start_at,finish,local_start::date) returning id into result;return result;
exception when exclusion_violation then raise exception 'Esse horário acabou de ser ocupado, escolha outro.';
 when unique_violation then raise exception 'Você já tem um agendamento neste dia. Para levar um amigo, ele precisa ter a própria conta.';
end $$;
create function public.get_busy_ranges(p_date date) returns table(start_at timestamptz,end_at timestamptz) language sql stable security definer set search_path=public as $$
 select a.start_at,a.end_at from appointments a where a.status in ('pendente','confirmado','concluido') and a.booking_date=p_date union all select b.start_at,b.end_at from blocked_slots b where b.start_at<((p_date+1)::timestamp at time zone 'America/Sao_Paulo') and b.end_at>(p_date::timestamp at time zone 'America/Sao_Paulo') $$;
create function public.erase_account_data(p_user_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
 perform pg_advisory_xact_lock(777001);delete from appointments where client_id=p_user_id and status<>'concluido';update appointments set client_id=null,cancel_reason=null where client_id=p_user_id;delete from push_subscriptions where user_id=p_user_id;end $$;
alter table profiles enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table blocked_slots enable row level security;
alter table business_hours enable row level security;
alter table settings enable row level security;
alter table push_subscriptions enable row level security;
create policy profiles_read on profiles for select to authenticated using(id=auth.uid() or is_admin());
create policy profiles_update on profiles for update to authenticated using(id=auth.uid() or is_admin()) with check(id=auth.uid() or is_admin());
create policy services_read on services for select using(active or is_admin());
create policy services_admin on services for all to authenticated using(is_admin()) with check(is_admin());
create policy hours_read on business_hours for select using(true);
create policy hours_admin on business_hours for all to authenticated using(is_admin()) with check(is_admin());
create policy settings_read on settings for select using(true);
create policy settings_admin on settings for all to authenticated using(is_admin()) with check(is_admin());
create policy appointments_read on appointments for select to authenticated using(client_id=auth.uid() or is_admin());
create policy blocks_admin on blocked_slots for all to authenticated using(is_admin()) with check(is_admin());
create policy push_own on push_subscriptions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on profiles,services,appointments,blocked_slots,business_hours,settings,push_subscriptions from anon,authenticated;
grant select on services,business_hours,settings to anon,authenticated;
grant select on profiles,appointments to authenticated;
grant update(nome,telefone,data_nascimento,privacy_accepted_at) on profiles to authenticated;
grant insert,update,delete on services,business_hours,settings to authenticated;
grant select,insert,update,delete on blocked_slots,push_subscriptions to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_admin() to anon,authenticated;
grant execute on function public.get_busy_ranges(date) to anon,authenticated;
grant execute on function public.create_appointment(uuid,timestamptz) to authenticated;
grant execute on function public.erase_account_data(uuid) to service_role;
alter publication supabase_realtime add table appointments,blocked_slots;
insert into settings(id) values(1);
insert into business_hours(weekday,closed,opens,closes) select d,d=0,case when d=6 then '07:00'::time else '09:00'::time end,case when d=6 then '18:00'::time else '19:00'::time end from generate_series(0,6) d;
insert into services(name,price,duration_minutes) values ('Acabamento (Pé)',0,40),('Barba Simples',0,40),('Barba Disf.',0,40),('Corte Simples',0,40),('Corte Disf. Máquina',0,40),('Corte Máquina e Tesoura',0,40),('Corte e Barba',0,40),('Sobrancelha',0,40),('Pigmentação',0,40);
