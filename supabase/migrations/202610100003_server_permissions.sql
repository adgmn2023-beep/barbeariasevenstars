-- Privilégios explícitos, sem depender de defaults do projeto Supabase.
grant all on public.profiles,public.services,public.appointments,public.blocked_slots,public.business_hours,public.settings,public.push_subscriptions to service_role;
