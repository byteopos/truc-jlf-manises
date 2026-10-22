-- 3) Da su rol a los dos usuarios iniciales.
-- Antes, créalos en Supabase > Authentication > Users > Add user > Create new user,
-- marcando "Auto Confirm User":
--   root@jlfmanises.local        con la contraseña de root
--   admin_jlf@jlfmanises.local   con la contraseña de admin_jlf
-- (Si cambias LOGIN_DOMAIN en config.js, usa ese dominio en lugar de jlfmanises.local.)

insert into public.profiles (user_id, username, role)
select id, split_part(email, '@', 1), case split_part(email, '@', 1) when 'root' then 'root' else 'admin' end
from auth.users
where split_part(email, '@', 1) in ('root', 'admin_jlf')
on conflict (user_id) do update set username = excluded.username, role = excluded.role;

select username, role from public.profiles order by role desc, username;
