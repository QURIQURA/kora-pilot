select set_config('request.jwt.claim.sub',public.shco_owner_id()::text,true);
set local role authenticated;
do $$
declare u uuid:=auth.uid(); oid uuid; item_id uuid:=gen_random_uuid(); check_id uuid:=gen_random_uuid(); prod uuid; standard uuid; sid uuid; got jsonb; plan jsonb; current_order public.orders%rowtype; original_orders jsonb; failed boolean; v uuid; selection public.work_session_formula_versions%rowtype;
begin
 select jsonb_agg(to_jsonb(o) order by id) into original_orders from public.orders o where user_id=u;
 select id into prod from public.products where user_id=u limit 1;
 select id into standard from public.cake_sizes where user_id=u and shape in ('ROUND','RECTANGLE','SQUARE') limit 1;
 plan:=jsonb_build_object('title','POPUP TEST','location','Kitchen','ends_at','2026-11-14T11:00:00Z','notes','fixture',
   'items',jsonb_build_array(jsonb_build_object('id',item_id,'product_id',prod,'standard_id',standard,'label','Profiteroles','quantity',200,'ready_quantity',100,'unit','pcs','work_session_id',''),jsonb_build_object('id',gen_random_uuid(),'product_id','','standard_id','','label','Weekly cake','quantity',4,'ready_quantity',0,'unit','cakes','work_session_id','')),
   'checklist',jsonb_build_array(jsonb_build_object('id',check_id,'group','PACKAGING','label','Boxes 25','done',false)));
 insert into public.orders(user_id,order_kind,popup_plan,pickup_at,event_date) values(u,'POPUP',plan,'2026-11-14T07:00:00Z','2026-11-14') returning * into current_order;
 oid:=current_order.id;
 if current_order.order_number is null or current_order.order_number='' then raise exception 'order number not generated'; end if;
 plan:=jsonb_set(plan,'{checklist,0,done}','true');
 got:=public.save_popup_order(oid,current_order.updated_at,plan,'2026-11-14T07:00:00Z','CONFIRMED');
 select * into current_order from public.orders where id=oid;
 if (current_order.popup_plan->'checklist'->0->>'done')::boolean is not true then raise exception 'check did not persist'; end if;
 got:=public.create_popup_item_session(oid,item_id,current_order.updated_at);sid:=(got->>'session_id')::uuid;
 if not exists(select 1 from public.work_sessions where id=sid and user_id=u and order_id is null and target_unit_count=200 and cake_size_id=standard) then raise exception 'per-item production link failed'; end if;
 if public.create_popup_item_session(oid,item_id,current_order.updated_at)->>'session_id'<>sid::text then raise exception 'session creation not idempotent'; end if;
 select * into current_order from public.orders where id=oid;
 plan:=jsonb_set(current_order.popup_plan,'{items,0,quantity}','240');
 perform public.save_popup_order(oid,current_order.updated_at,plan,'2026-11-14T07:00:00Z','CONFIRMED');
 if (select target_unit_count from public.work_sessions where id=sid)<>240 then raise exception 'planned target not synchronized'; end if;
 failed:=false;
 begin perform public.save_popup_order(oid,current_order.updated_at-interval '1 second',plan,null,'CONFIRMED'); exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'stale save accepted';end if;
 select * into current_order from public.orders where id=oid;
 failed:=false;
 begin perform public.save_popup_order(oid,current_order.updated_at,jsonb_set(plan,'{items,0,quantity}','-1'),'2026-11-14T07:00:00Z','CONFIRMED');exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'invalid quantity accepted';end if;
 failed:=false;
 begin perform public.save_popup_order(oid,current_order.updated_at,jsonb_set(plan,'{items,0,product_id}',to_jsonb(gen_random_uuid()::text)),'2026-11-14T07:00:00Z','CONFIRMED');exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'inaccessible product accepted';end if;
 failed:=false;
 begin perform public.create_popup_item_session(gen_random_uuid(),item_id,current_order.updated_at);exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'inaccessible popup accepted';end if;
 if exists(select 1 from jsonb_array_elements(original_orders) old_row join public.orders o on o.id=(old_row->>'id')::uuid where old_row<>to_jsonb(o)) then raise exception 'ordinary orders mutated';end if;
 if not exists(select 1 from public.order_production_sync_log where order_id=oid and source='popup_plan') then raise exception 'audit log missing';end if;
 select id into v from public.formula_versions where user_id=u and status='CURRENT' limit 1;
 insert into public.work_session_formula_versions(user_id,work_session_id,formula_version_id,kind,multiplier,version_pinned)
 values(u,sid,v,'CORE',1,true) returning * into selection;
 perform public.save_order_component_plan(selection.id,selection.updated_at,v,2,500,true);
 if not exists(select 1 from public.work_session_formula_versions where id=selection.id and multiplier=2 and target_quantity_g=500) then raise exception 'popup recipe plan failed';end if;
 if not exists(select 1 from public.order_production_sync_log where order_id=oid and source='popup_component_plan' and selection_id=selection.id) then raise exception 'popup recipe audit missing';end if;
 update public.work_sessions set status='COMPLETED' where id=sid;
 select * into selection from public.work_session_formula_versions where id=selection.id;
 failed:=false;
 begin perform public.save_order_component_plan(selection.id,selection.updated_at,v,3,500,true);exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'completed production was editable';end if;

end $$;
select 'PASS: multi-item popup, checklist persistence, planned quantities, stable sessions, history, validation and ownership' as result;
