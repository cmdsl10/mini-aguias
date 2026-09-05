
create table public.club_history (
 id text primary key default 'main' check (id = 'main'),
 title text not null check (length(trim(title)) between 1 and 200),
 body text not null default '',
 published boolean not null default false
);
alter table public.club_history enable row level security;
grant select on public.club_history to anon;
grant select,insert,update,delete on public.club_history to authenticated;
create policy history_public on public.club_history for select to anon,authenticated using (published);
create policy history_admin on public.club_history for all to authenticated
 using ((select auth.jwt()->'app_metadata'->>'role')='admin')
 with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
insert into public.club_history(id,title,body,published) values
 ('main','História dos Mini-Águias','Espaço preparado para a história, fundação, evolução, direção e momentos marcantes do Grupo Desportivo Mini-Águias.',true);

alter table public.gallery_items add column description text not null default '';
alter table public.gallery_items add column image_paths text[] not null default '{}';
alter table public.gallery_items alter column image_url drop not null;
alter table public.gallery_items alter column published set default false;
alter table public.gallery_items add constraint gallery_images_limit check (cardinality(image_paths)<=20);
grant select on public.gallery_items to anon;
grant select,insert,update,delete on public.gallery_items to authenticated;
create policy admin_read_gallery on public.gallery_items for select to authenticated
 using ((select auth.jwt()->'app_metadata'->>'role')='admin');
create index gallery_public_order on public.gallery_items(published,sort_order,created_at);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('club-memories','club-memories',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy memories_media_admin on storage.objects for all to authenticated
 using (bucket_id='club-memories' and (select auth.jwt()->'app_metadata'->>'role')='admin')
 with check (bucket_id='club-memories' and (select auth.jwt()->'app_metadata'->>'role')='admin');
create policy memories_media_published on storage.objects for select to anon,authenticated
 using (bucket_id='club-memories' and exists (
 select 1 from public.gallery_items g where g.published and objects.name=any(g.image_paths)
 ));

