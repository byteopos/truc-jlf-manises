-- 4) Auditoría (solo la ve root). Añadido el 23/10/2026.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  username text not null,
  action text not null,
  entity text,
  entity_id text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on public.audit_log(at desc);
create index if not exists audit_log_user_idx on public.audit_log(username);
alter table public.audit_log enable row level security;

create or replace function public.audit_strip(j jsonb)
returns jsonb language sql immutable as $$
  select case when j is null then null else
    (j - 'logo' - 'jlf_logo' - 'updated')
    || case when j ? 'logo' then jsonb_build_object('logo', case when j->>'logo' is null then null else 'imagen:' || md5(j->>'logo') end) else '{}'::jsonb end
    || case when j ? 'jlf_logo' then jsonb_build_object('jlf_logo', case when j->>'jlf_logo' is null then null else 'imagen:' || md5(j->>'jlf_logo') end) else '{}'::jsonb end
  end
$$;

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  uname text;
  old_j jsonb := case when TG_OP <> 'INSERT' then public.audit_strip(to_jsonb(old)) end;
  new_j jsonb := case when TG_OP <> 'DELETE' then public.audit_strip(to_jsonb(new)) end;
  row_j jsonb;
  diff jsonb := '{}'::jsonb;
  eid text;
begin
  row_j := coalesce(new_j, old_j);
  if TG_OP = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('antes', old_j->k, 'despues', new_j->k)), '{}'::jsonb)
      into diff from jsonb_object_keys(new_j) k where (old_j->k) is distinct from (new_j->k);
    if diff = '{}'::jsonb then return new; end if;
  end if;
  if uid is not null then select username into uname from public.profiles where user_id = uid; end if;
  eid := case TG_TABLE_NAME
           when 'matches' then 'J' || (row_j->>'round_n') || '-' || (row_j->>'idx')
           when 'rounds' then 'J' || (row_j->>'n')
           when 'settings' then 'ajustes'
           else row_j->>'id' end;
  insert into public.audit_log(user_id, username, action, entity, entity_id, detail)
  values (uid, coalesce(uname, case when uid is null then 'mantenimiento' else 'desconocido' end),
          lower(TG_OP), TG_TABLE_NAME, eid, jsonb_build_object('cambios', diff, 'fila', row_j));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','fallas','pairs','rounds','matches'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end $$;

create or replace function public.audit_event(p_action text, p_info text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  if auth.uid() is null or p_action not in ('login', 'logout') then return; end if;
  select username into uname from public.profiles where user_id = auth.uid();
  if uname is null then return; end if;
  insert into public.audit_log(user_id, username, action, entity, detail)
  values (auth.uid(), uname, p_action, 'sesion', jsonb_build_object('dispositivo', left(coalesce(p_info, ''), 160)));
end $$;

create or replace function public.audit_failed_login(p_username text, p_info text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_username is null or char_length(p_username) > 40 then return; end if;
  if (select count(*) from public.audit_log where action = 'login_fallido' and at > now() - interval '1 hour') >= 100 then return; end if;
  insert into public.audit_log(username, action, entity, detail)
  values (left(p_username, 40), 'login_fallido', 'sesion', jsonb_build_object('dispositivo', left(coalesce(p_info, ''), 160)));
end $$;

create or replace function public.audit_entries(p_limit int default 200, p_username text default null)
returns setof public.audit_log language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'root' then
    raise exception 'Solo el administrador principal puede ver la auditoría' using errcode = '42501';
  end if;
  return query select * from public.audit_log
    where p_username is null or username = p_username
    order by at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

revoke all on function public.audit_entries(int, text) from public, anon;
grant execute on function public.audit_entries(int, text) to authenticated;
revoke all on function public.audit_event(text, text) from public, anon;
grant execute on function public.audit_event(text, text) to authenticated;
grant execute on function public.audit_failed_login(text, text) to anon, authenticated;
revoke all on function public.audit_row() from public, anon, authenticated;
