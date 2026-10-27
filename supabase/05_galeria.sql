-- 5) Galería de fotos por jornada (añadido el 27/10/2026).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('galeria', 'galeria', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "galeria: organizacion sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'galeria' and (select public.my_role()) in ('admin','root'));
create policy "galeria: organizacion borra" on storage.objects for delete to authenticated
  using (bucket_id = 'galeria' and (select public.my_role()) in ('admin','root'));
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  round_n int not null references public.rounds(n) on delete cascade,
  path text not null,
  thumb text not null,
  caption text not null default '' check (char_length(caption) <= 200),
  width int, height int,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists photos_round_idx on public.photos(round_n, created_at);
alter table public.photos enable row level security;
create policy "lectura publica" on public.photos for select to anon, authenticated using (true);
create policy "organizacion inserta" on public.photos for insert to authenticated with check ((select public.my_role()) in ('admin','root'));
create policy "organizacion actualiza" on public.photos for update to authenticated using ((select public.my_role()) in ('admin','root')) with check ((select public.my_role()) in ('admin','root'));
create policy "organizacion borra" on public.photos for delete to authenticated using ((select public.my_role()) in ('admin','root'));
create trigger audit_photos after insert or update or delete on public.photos for each row execute function public.audit_row();
alter publication supabase_realtime add table public.photos;

-- Vistas de cada foto (al abrirla en grande, una por persona y sesión)
create table if not exists public.photo_views (
  id bigint generated always as identity primary key,
  photo_id uuid not null references public.photos(id) on delete cascade,
  visitor text not null check (char_length(visitor) between 8 and 64),
  at timestamptz not null default now()
);
create index if not exists photo_views_photo_idx on public.photo_views(photo_id);
alter table public.photo_views enable row level security;
create or replace function public.track_photo_view(p_photo uuid, p_visitor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_photo is null or p_visitor is null or char_length(p_visitor) not between 8 and 64 then return; end if;
  if not exists (select 1 from public.photos where id = p_photo) then return; end if;
  insert into public.photo_views(photo_id, visitor) values (p_photo, p_visitor);
end $$;
grant execute on function public.track_photo_view(uuid, text) to anon, authenticated;
create or replace function public.photo_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') not in ('admin','root') then
    raise exception 'Solo la organización puede ver estas estadísticas' using errcode = '42501';
  end if;
  return coalesce((select jsonb_object_agg(photo_id, jsonb_build_object('views', n, 'unique', u))
    from (select photo_id, count(*) n, count(distinct visitor) u from public.photo_views group by photo_id) t), '{}'::jsonb);
end $$;
revoke all on function public.photo_stats() from public, anon;
grant execute on function public.photo_stats() to authenticated;
