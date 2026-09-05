
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
insert into public.gallery_items(id,title,description,published,image_paths) values
 ('00000000-0000-4000-8000-000000000091','CMS QA draft','Draft',false,array['qa/draft.png']),
 ('00000000-0000-4000-8000-000000000092','CMS QA public','Public',true,array['qa/public.png']);
insert into storage.objects(bucket_id,name) values ('club-memories','qa/draft.png'),('club-memories','qa/public.png');
do $$ begin
 if (select count(*) from public.gallery_items where title like 'CMS QA%') <> 2 then raise exception 'Admin cannot read drafts'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if (select count(*) from public.gallery_items where title like 'CMS QA%') <> 1 then raise exception 'Public draft leak'; end if;
 if (select count(*) from storage.objects where bucket_id='club-memories' and name like 'qa/%') <> 1 then raise exception 'Image draft leak'; end if;
 begin
 insert into public.gallery_items(title) values ('Forbidden');
 raise exception 'Anonymous write allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","user_metadata":{"role":"admin"},"app_metadata":{}}',true);
do $$ begin
 if (select count(*) from public.gallery_items where title like 'CMS QA%') <> 1 then raise exception 'Member draft leak'; end if;
 begin
 insert into public.gallery_items(title) values ('Forbidden');
 raise exception 'Member write allowed';
 exception when insufficient_privilege then null; end;
 begin
 update public.club_history set title='Forbidden';
 if found then raise exception 'Member history update allowed'; end if;
 end;
 begin
 insert into storage.objects(bucket_id,name) values ('club-memories','qa/forbidden.png');
 raise exception 'Member image upload allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
update public.gallery_items set published=false,sort_order=5,description='Edited' where id='00000000-0000-4000-8000-000000000092';
update public.club_history set published=false where id='main';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if exists(select 1 from public.gallery_items where title like 'CMS QA%') then raise exception 'Unpublish failed'; end if;
 if exists(select 1 from public.club_history) then raise exception 'History draft leak'; end if;
 if exists(select 1 from storage.objects where bucket_id='club-memories' and name like 'qa/%') then raise exception 'Unpublished image leak'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
delete from public.gallery_items where title like 'CMS QA%';
do $$ begin if exists(select 1 from public.gallery_items where title like 'CMS QA%') then raise exception 'Delete failed'; end if; end $$;
rollback;

