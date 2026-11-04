-- Production verification: synthetic module records, all changes rolled back.
begin;
set local statement_timeout='45s';
do $verify$
declare
 administrator uuid; reader uuid; player uuid:=gen_random_uuid(); coach uuid:=gen_random_uuid();
 training uuid; payment1 uuid:=gen_random_uuid(); payment2 uuid:=gen_random_uuid();
 rejected boolean; affected integer; original_role text:=current_user;
begin
 if exists(select 1 from public.masters_players) then raise exception 'Run this rollback test only before importing the real roster'; end if;
 select id into administrator from auth.users where raw_app_meta_data->>'role'='admin' limit 1;
 select id into reader from auth.users where coalesce(raw_app_meta_data->>'role','')<>'admin' limit 1;
 if administrator is null or reader is null then raise exception 'Controlled role verification requires existing accounts'; end if;
 perform set_config('request.jwt.claim.sub',administrator::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','app_metadata',jsonb_build_object('role','admin'))::text,true);
 perform set_config('role','authenticated',true);
 insert into public.masters_players(id,display_name,auth_user_id,attendance_eligible)
 values(player,'TESTE TRANSACIONAL MASTERS',reader,true);
 insert into public.masters_players(id,display_name,sports_role,attendance_eligible)
 values(coach,'TESTE TRANSACIONAL TREINADOR','coach',null);
 training:=public.masters_create_training('2026-10-21');
 rejected:=false;
 begin update public.masters_trainings set status='closed' where id=training;
 exception when sqlstate 'P0001' then rejected:=true; end;
 if not rejected then raise exception 'Incomplete training closure was accepted'; end if;
 update public.masters_attendance set status='absent' where training_id=training and player_id=player;
 update public.masters_trainings set status='closed' where id=training;
 rejected:=false;
 begin update public.masters_attendance set status='absent' where training_id=training and player_id=coach;
 exception when sqlstate 'P0001' then rejected:=true; end;
 if not rejected then raise exception 'Unconfirmed staff eligibility was accepted'; end if;
 perform public.masters_record_payment(payment1,player,50,jsonb_build_array(jsonb_build_object('training_id',training,'amount_cents',50)),'TESTE');
 if (select sum(amount_cents) from public.masters_payment_allocations where player_id=player)<>50 then raise exception 'Partial allocation mismatch'; end if;
 rejected:=false;
 begin perform public.masters_record_payment(gen_random_uuid(),player,60,jsonb_build_array(jsonb_build_object('training_id',training,'amount_cents',60)),'TESTE');
 exception when sqlstate 'P0001' then rejected:=true; end;
 if not rejected then raise exception 'Over-allocation was accepted'; end if;
 perform public.masters_record_payment(payment2,player,50,jsonb_build_array(jsonb_build_object('training_id',training,'amount_cents',50)),'TESTE');
 rejected:=false;
 begin perform public.masters_record_payment(payment2,player,50,jsonb_build_array(jsonb_build_object('training_id',training,'amount_cents',50)),'TESTE');
 exception when unique_violation then rejected:=true; end;
 if not rejected then raise exception 'Repeated payment identifier was accepted'; end if;
 rejected:=false;
 begin update public.masters_attendance set status='present' where training_id=training and player_id=player;
 exception when sqlstate 'P0001' then rejected:=true; end;
 if not rejected then raise exception 'Paid absence correction was accepted'; end if;
 rejected:=false;
 begin update public.masters_trainings set status='open' where id=training;
 exception when sqlstate 'P0001' then rejected:=true; end;
 if not rejected then raise exception 'Paid training reopening was accepted'; end if;
 perform public.masters_reverse_payment(payment1,'TESTE DE ESTORNO TRANSACIONAL');
 if (select sum(amount_cents) from public.masters_payment_allocations where player_id=player)<>50 then raise exception 'Reversal mismatch'; end if;
 if not exists(select 1 from public.masters_audit where event_type='masters_payments.delete') then raise exception 'Reversal audit missing'; end if;
 perform set_config('request.jwt.claim.sub',reader::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader,'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 if (select count(*) from public.masters_players)<>2 then raise exception 'Authorized reader cannot read'; end if;
 update public.masters_attendance set status='present' where player_id=player;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Reader could modify attendance'; end if;
 rejected:=false;
 begin insert into public.masters_players(display_name) values('TESTE NAO AUTORIZADO');
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Reader could insert'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 perform set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{},"user_metadata":{"role":"admin"}}',true);
 if (select count(*) from public.masters_players)<>0 then raise exception 'External account could read'; end if;
 if (select count(*) from public.masters_payments)<>0 then raise exception 'External account could read financial records'; end if;
 perform set_config('role','anon',true);
 rejected:=false;
 begin perform count(*) from public.masters_players;
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Visitor could read private records'; end if;
 perform set_config('role',original_role,true);
end
$verify$;
rollback;
select 'PASS' as status,'Admin, authorized reader, external, visitor, closure, partial payments, over-allocation, retry, reversal, audit and staff eligibility; writes rolled back' as verification;
