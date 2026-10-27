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
