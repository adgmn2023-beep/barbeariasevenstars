-- Bootstrap único: cadastre primeiro a conta do responsável e troque o e-mail abaixo.
-- Execute uma vez no SQL Editor para promover a primeira conta a master.
update public.profiles
set role='master'
where lower(email)=lower('master@example.com')
	and role='client';
