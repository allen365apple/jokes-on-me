-- Fixed public URL, browser-per-round ballots, private controller capability.
begin;
create table if not exists public.jlv_live_private(id text primary key, secret text not null);
create table if not exists public.jlv_live_rounds(id uuid primary key, snapshot jsonb not null);
create table if not exists public.jlv_live_room(id text primary key, snapshot jsonb not null, last_command uuid);
create table if not exists public.jlv_live_ballots(round_id uuid references public.jlv_live_rounds(id), device uuid not null, team text not null check(team in ('blue','orange')), received_at timestamptz default clock_timestamp(), primary key(round_id,device));
create table if not exists public.jlv_live_signal(id text primary key, round bigint not null, version bigint not null);
alter table public.jlv_live_private enable row level security;
alter table public.jlv_live_rounds enable row level security;
alter table public.jlv_live_room enable row level security;
alter table public.jlv_live_ballots enable row level security;
alter table public.jlv_live_signal enable row level security;
revoke all on public.jlv_live_private,public.jlv_live_rounds,public.jlv_live_room,public.jlv_live_ballots,public.jlv_live_signal from public,anon,authenticated;
grant select on public.jlv_live_room,public.jlv_live_signal to anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='jlv_live_room' and policyname='jlv_live_public') then
  create policy jlv_live_public on public.jlv_live_room for select to anon,authenticated using(true);
  create policy jlv_live_public on public.jlv_live_signal for select to anon,authenticated using(true);
 end if;
end $$;
insert into public.jlv_live_private values('main',replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')) on conflict do nothing;
do $$ declare s jsonb; begin
 if not exists(select 1 from public.jlv_live_room where id='main') then
 s:=jsonb_build_object('id',gen_random_uuid(),'round',1,'version',1,'status','ready','counts',jsonb_build_array(0,0),'expected',150,'title','看我笑話現場投票','created_at',clock_timestamp(),'teams',
 '[{"id":"blue","name":"藍隊","color":"#2854ed","members":[{"name":"傑哥","avatar":"../love-improv/profiles/thumbs/傑哥.jpg","position":35},{"name":"芭樂","avatar":"../love-improv/profiles/thumbs/芭樂.jpg","position":35},{"name":"竹節蟲","avatar":"../love-improv/profiles/thumbs/竹節蟲.jpg","position":35},{"name":"兔子","avatar":"../love-improv/profiles/thumbs/兔子.jpg","position":35}]},{"id":"orange","name":"橘隊","color":"#ff7836","members":[{"name":"柏文","avatar":"../love-improv/profiles/thumbs/柏文.jpg","position":35},{"name":"大弋","avatar":"../love-improv/profiles/thumbs/大弋.jpg","position":35},{"name":"巧達","avatar":"../love-improv/profiles/thumbs/巧達.jpg","position":35},{"name":"又又","avatar":"../love-improv/profiles/thumbs/又又.jpg","position":35}]}]'::jsonb);
 insert into public.jlv_live_rounds values((s->>'id')::uuid,s);
 insert into public.jlv_live_room values('main',s,null);
 insert into public.jlv_live_signal values('main',1,1);
 end if;
end $$;
create or replace function public.jlv_live_access(p_secret text) returns boolean language sql stable security definer set search_path='' as $$
 select p_secret is not null and exists(select 1 from public.jlv_live_private where id='main' and secret=p_secret);
$$;
create or replace function public.jlv_live_state(p_device uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('session',r.snapshot,'team',(select b.team from public.jlv_live_ballots b where b.round_id=(r.snapshot->>'id')::uuid and b.device=p_device)) from public.jlv_live_room r where r.id='main';
$$;
create or replace function public.jlv_live_vote(p_round uuid,p_device uuid,p_team text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; previous text; slot integer; counts jsonb; begin
 if p_device is null then raise exception '無法儲存瀏覽器身分，請使用一般瀏覽模式。'; end if;
 select snapshot into s from public.jlv_live_room where id='main' for update;
 if (s->>'id')::uuid is distinct from p_round then raise exception '已進入下一輪，請重新選隊。'; end if;
 select team into previous from public.jlv_live_ballots where round_id=p_round and device=p_device;
 if previous=p_team then return jsonb_build_object('session',s,'team',previous); end if;
 if s->>'status'<>'open' then raise exception '這輪投票尚未開放或已截止。'; end if;
 if p_team is null or p_team not in('blue','orange') then raise exception '請選擇一隊。'; end if;
 slot:=case when p_team='blue' then 0 else 1 end;
 if s->'teams'->slot->>'id' is distinct from p_team then raise exception '隊伍不正確。'; end if;
 counts:=s->'counts';
 if previous is not null then
  counts:=jsonb_set(counts,array[(1-slot)::text],to_jsonb((counts->>(1-slot))::integer-1));
 end if;
 insert into public.jlv_live_ballots(round_id,device,team) values(p_round,p_device,p_team)
 on conflict(round_id,device) do update set team=excluded.team,received_at=clock_timestamp();
 counts:=jsonb_set(counts,array[slot::text],to_jsonb((counts->>slot)::integer+1));
 s:=s||jsonb_build_object('counts',counts,'version',(s->>'version')::bigint+1);
 update public.jlv_live_room set snapshot=s where id='main';
 return jsonb_build_object('session',s,'team',p_team);
end $$;
create or replace function public.jlv_live_command(p_secret text,p_round uuid,p_operation text,p_command uuid,p_settings jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; last_id uuid; totals jsonb; t jsonb; m jsonb; begin
 if not public.jlv_live_access(p_secret) then raise exception '需要有效的控制端操作碼。' using errcode='42501'; end if;
 if p_command is null then raise exception '缺少操作識別碼。'; end if;
 select snapshot,last_command into s,last_id from public.jlv_live_room where id='main' for update;
 if last_id=p_command then return s; end if;
 if (s->>'id')::uuid is distinct from p_round then raise exception '輪次已更新，請重新確認畫面。'; end if;
 if p_operation='open' and s->>'status'='ready' then s:=s||jsonb_build_object('status','open','opened_at',clock_timestamp());
 elsif p_operation='close' and s->>'status'='open' then
  select jsonb_build_array(count(*) filter(where team='blue'),count(*) filter(where team='orange')) into totals from public.jlv_live_ballots where round_id=p_round;
  s:=s||jsonb_build_object('status','closed','counts',totals,'closed_at',clock_timestamp());
 elsif p_operation='restart' and s->>'status'='closed' then
  update public.jlv_live_rounds set snapshot=s where id=p_round;
  s:=s||jsonb_build_object('id',gen_random_uuid(),'round',(s->>'round')::bigint+1,'version',0,'status','open','counts',jsonb_build_array(0,0),'opened_at',clock_timestamp(),'closed_at',null,'created_at',clock_timestamp());
  insert into public.jlv_live_rounds values((s->>'id')::uuid,s);
 elsif p_operation='save' and s->>'status'<>'open' then
  if jsonb_typeof(p_settings->'teams') is distinct from 'array' then raise exception '請設定兩隊。'; end if;
  if jsonb_array_length(p_settings->'teams')<>2 or octet_length(p_settings::text)>48000 then raise exception '設定格式不正確。'; end if;
  if p_settings->'teams'->0->>'id' is distinct from 'blue' or p_settings->'teams'->1->>'id' is distinct from 'orange' then raise exception '隊伍識別碼不正確。'; end if;
  if (p_settings->>'expected')::integer not between 1 and 10000 or coalesce(char_length(trim(p_settings->>'title')),0) not between 1 and 60 then raise exception '場次名稱或人數不正確。'; end if;
  for t in select value from jsonb_array_elements(p_settings->'teams') loop
   if coalesce(char_length(trim(t->>'name')),0) not between 1 and 12 or coalesce(t->>'color','') !~ '^#[0-9a-fA-F]{6}$' then raise exception '隊名或顏色不正確。'; end if;
   if jsonb_typeof(t->'members') is distinct from 'array' then raise exception '成員格式不正確。'; end if;
   if jsonb_array_length(t->'members') not between 1 and 8 then raise exception '每隊需有 1～8 位成員。'; end if;
   for m in select value from jsonb_array_elements(t->'members') loop
    if coalesce(char_length(trim(m->>'name')),0) not between 1 and 16 then raise exception '成員名稱不正確。'; end if;
    if coalesce(m->>'avatar','')<>'' and coalesce(m->>'avatar','') !~ '^(https://|\.\./love-improv/profiles/)' then raise exception '頭像網址不正確。'; end if;
   end loop;
  end loop;
  -- Ended round metadata is immutable; saved settings apply only to the next round.
  if s->>'status'='closed' then
   s:=s||jsonb_build_object('next_settings',p_settings);
  else s:=s||jsonb_build_object('teams',p_settings->'teams','title',p_settings->>'title','expected',(p_settings->>'expected')::integer); end if;
 else raise exception '狀態已變更，請重新確認畫面。'; end if;
 if p_operation='restart' and s ? 'next_settings' then
  s:=s||jsonb_build_object('teams',s->'next_settings'->'teams','title',s->'next_settings'->>'title','expected',(s->'next_settings'->>'expected')::integer);
  s:=s-'next_settings';
 end if;
 s:=s||jsonb_build_object('version',(s->>'version')::bigint+1);
 update public.jlv_live_room set snapshot=s,last_command=p_command where id='main';
 if s->>'status'='closed' then update public.jlv_live_rounds set snapshot=s where id=(s->>'id')::uuid; end if;
 update public.jlv_live_signal set round=(s->>'round')::bigint,version=(s->>'version')::bigint where id='main';
 return s;
end $$;
create or replace function public.jlv_live_history(p_secret text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.jlv_live_access(p_secret) then raise exception '需要控制端操作碼。' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(snapshot order by (snapshot->>'round')::bigint desc) from public.jlv_live_rounds where snapshot->>'status'='closed'),'[]'::jsonb);
end $$;
revoke all on function public.jlv_live_access(text),public.jlv_live_state(uuid),public.jlv_live_vote(uuid,uuid,text),public.jlv_live_command(text,uuid,text,uuid,jsonb),public.jlv_live_history(text) from public,anon,authenticated;
grant execute on function public.jlv_live_access(text),public.jlv_live_state(uuid),public.jlv_live_vote(uuid,uuid,text),public.jlv_live_command(text,uuid,text,uuid,jsonb),public.jlv_live_history(text) to anon,authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jlv_live_room') then alter publication supabase_realtime add table public.jlv_live_room; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jlv_live_signal') then alter publication supabase_realtime add table public.jlv_live_signal; end if;
 end if;
end $$;
commit;
