begin;

alter table public.profiles
  add column must_change_password boolean not null default false;

alter table public.appointments add column barber_name text;
update public.appointments a
set barber_name=b.display_name
from public.barbers b
where b.id=a.barber_id;
create function public.snapshot_appointment_barber_name() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  select b.display_name into new.barber_name
  from public.barbers b where b.id=new.barber_id;
  return new;
end $$;
create trigger appointment_barber_name_snapshot
  before insert or update of barber_id on public.appointments
  for each row execute function public.snapshot_appointment_barber_name();

create table public.audit_log(
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id),
  action text not null check(length(trim(action)) between 2 and 100),
  target_profile_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public,anon,authenticated;
grant all on public.audit_log to service_role;

create or replace function public.guard_appointment() returns trigger
language plpgsql set search_path=public as $$ begin
  if (to_jsonb(new)-array['status','cancel_reason','client_id','service_id','barber_id','barber_name'])
    is distinct from (to_jsonb(old)-array['status','cancel_reason','client_id','service_id','barber_id','barber_name']) then
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
    (old.status='confirmado' and (
      new.status in ('concluido','faltou') and old.end_at<=now()
      or new.status='cancelado'
    ))
  ) then raise exception 'Mudança de status não permitida.'; end if;
  if new.status='cancelado' and length(trim(coalesce(new.cancel_reason,'')))<3 then
    raise exception 'Informe o motivo do cancelamento.';
  end if;
  return new;
end $$;

commit;