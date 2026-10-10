-- Exclusão transacional: dados pessoais e usuário Auth juntos.
create or replace function public.erase_account_data(p_user_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
 perform pg_advisory_xact_lock(777001);
 delete from appointments where client_id=p_user_id and status<>'concluido';
 update appointments set client_id=null,cancel_reason=null where client_id=p_user_id;
 delete from auth.users where id=p_user_id;
end $$;
revoke all on function public.erase_account_data(uuid) from public,anon,authenticated;
grant execute on function public.erase_account_data(uuid) to service_role;
