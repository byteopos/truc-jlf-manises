-- Campionat de Truc · JLF Manises
-- 1) Tablas, permisos (RLS) y tiempo real. Ejecutar una vez en Supabase > SQL Editor.

create table if not exists public.profiles (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role     text not null check (role in ('admin', 'root'))
);

create table if not exists public.settings (
  id       int primary key default 1 check (id = 1),
  season   text not null default '',
  notice   text not null default '',
  jlf_logo text,
  weekly   jsonb not null default '{"match": null, "bestPair": null}',
  updated  date not null default current_date
);

create table if not exists public.fallas (
  id        text primary key,
  name      text not null,
  short     text not null,
  color     text not null default '#888888',
  logo      text,
  host_only boolean not null default false,
  sort      int not null default 0
);

create table if not exists public.pairs (
  id       text primary key,
  falla_id text not null references public.fallas(id) on update cascade,
  num      int  not null check (num in (1, 2)),
  player1  text not null default '',
  player2  text not null default '',
  nick     text not null default ''
);

create table if not exists public.rounds (
  n           int primary key,
  date        date not null,
  host        text not null references public.fallas(id) on update cascade,
  confirmed   boolean not null default false,
  provisional boolean not null default false
);

create table if not exists public.matches (
  round_n int  not null references public.rounds(n) on delete cascade,
  idx     int  not null,
  a       text not null references public.pairs(id),
  b       text not null references public.pairs(id),
  sa      int  check (sa between 0 and 3),
  sb      int  check (sb between 0 and 3),
  primary key (round_n, idx),
  check ((sa is null and sb is null) or (sa + sb = 3))
);

-- Rol del usuario conectado ('admin', 'root' o null para el público)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

-- Solo root puede cambiar la fecha o el casal de una jornada
create or replace function public.rounds_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.date is distinct from old.date or new.host is distinct from old.host)
     and coalesce(public.my_role(), '') <> 'root' and auth.role() <> 'service_role' then
    raise exception 'Solo el administrador principal puede cambiar fechas y casales' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists rounds_guard on public.rounds;
create trigger rounds_guard before update on public.rounds for each row execute function public.rounds_guard();

-- RLS: todo el mundo lee; organización (admin/root) escribe; root crea o borra estructura.
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.fallas   enable row level security;
alter table public.pairs    enable row level security;
alter table public.rounds   enable row level security;
alter table public.matches  enable row level security;

drop policy if exists "perfil propio o root" on public.profiles;
create policy "perfil propio o root" on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.my_role() = 'root');

do $$
declare t text;
begin
  foreach t in array array['settings', 'fallas', 'pairs', 'rounds', 'matches'] loop
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "organizacion actualiza" on public.%I', t);
    execute format('create policy "organizacion actualiza" on public.%I for update to authenticated using (public.my_role() in (''admin'', ''root'')) with check (public.my_role() in (''admin'', ''root''))', t);
  end loop;
end $$;

-- Altas y bajas
drop policy if exists "organizacion inserta" on public.settings;
create policy "organizacion inserta" on public.settings for insert to authenticated with check (public.my_role() in ('admin', 'root'));
drop policy if exists "organizacion inserta" on public.matches;
create policy "organizacion inserta" on public.matches for insert to authenticated with check (public.my_role() in ('admin', 'root'));
drop policy if exists "organizacion borra" on public.matches;
create policy "organizacion borra" on public.matches for delete to authenticated using (public.my_role() in ('admin', 'root'));
do $$
declare t text;
begin
  foreach t in array array['fallas', 'pairs', 'rounds'] loop
    execute format('drop policy if exists "root inserta" on public.%I', t);
    execute format('create policy "root inserta" on public.%I for insert to authenticated with check (public.my_role() = ''root'')', t);
    execute format('drop policy if exists "root borra" on public.%I', t);
    execute format('create policy "root borra" on public.%I for delete to authenticated using (public.my_role() = ''root'')', t);
  end loop;
end $$;

-- Tiempo real: la web se actualiza sola cuando se publican resultados
do $$
declare t text;
begin
  foreach t in array array['settings', 'fallas', 'pairs', 'rounds', 'matches'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
