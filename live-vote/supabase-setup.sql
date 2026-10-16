-- 看我笑話現場投票 / isolated additive schema. Run as database owner after review.
-- Never paste a service-role key into the website. This file contains no credentials.
begin;

create table if not exists public.jlv_admins (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.jlv_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  teams jsonb not null,
  expected integer not null default 150 check (expected between 1 and 10000),
  status text not null default 'ready' check (status in ('ready','open','closed')),
  counts integer[] not null default array[0,0] check (array_length(counts,1) = 2 and counts[1] >= 0 and counts[2] >= 0),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz
);
create table if not exists public.jlv_votes (
  session_id uuid not null references public.jlv_sessions(id),
  voter_id uuid not null references auth.users(id),
  team text not null check (team in ('blue','orange')),
  received_at timestamptz not null default clock_timestamp(),
  primary key (session_id, voter_id)
);
-- Audience devices need open/close/config notifications, NOT every intermediate vote.
-- Separate signals prevent a 150-vote burst fanning out to all 150 phones.
create table if not exists public.jlv_signals (
  id uuid primary key references public.jlv_sessions(id),
  status text not null,
  version bigint not null
);
alter table public.jlv_admins enable row level security;
alter table public.jlv_sessions enable row level security;
alter table public.jlv_votes enable row level security;
alter table public.jlv_signals enable row level security;
revoke all on public.jlv_admins, public.jlv_sessions, public.jlv_votes from public, anon, authenticated;
grant select on public.jlv_sessions to anon, authenticated;
grant select on public.jlv_votes to authenticated;
revoke all on public.jlv_signals from public, anon, authenticated;
grant select on public.jlv_signals to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jlv_sessions' and policyname='jlv_read_aggregates') then
    create policy jlv_read_aggregates on public.jlv_sessions for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jlv_votes' and policyname='jlv_read_own_vote') then
    create policy jlv_read_own_vote on public.jlv_votes for select to authenticated using (voter_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jlv_signals' and policyname='jlv_read_signals') then
    create policy jlv_read_signals on public.jlv_signals for select to anon, authenticated using (true);
  end if;
end $$;

create or replace function public.jlv_emit_signal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.jlv_signals(id,status,version) values(new.id,new.status,new.version)
    on conflict(id) do update set status=excluded.status, version=excluded.version;
  return new;
end $$;
revoke all on function public.jlv_emit_signal() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname='jlv_signal_changed' and tgrelid='public.jlv_sessions'::regclass) then
    create trigger jlv_signal_changed after insert or update of status,title,teams,expected on public.jlv_sessions
      for each row execute function public.jlv_emit_signal();
  end if;
end $$;
insert into public.jlv_signals(id,status,version) select id,status,version from public.jlv_sessions on conflict(id) do nothing;

-- All functions pin search_path and qualify relations to prevent object shadowing.
create or replace function public.jlv_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.jlv_admins where user_id = auth.uid());
$$;

-- Private validator used by administrative RPCs; never exposed for client execution.
create or replace function public.jlv_validate_settings(p_settings jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  teams jsonb := p_settings->'teams'; t jsonb; m jsonb; i integer; expected integer;
begin
  if jsonb_typeof(teams) is distinct from 'array' then raise exception '請設定兩支隊伍。'; end if;
  if jsonb_array_length(teams) <> 2 then raise exception '請設定兩支隊伍。'; end if;
  if coalesce(char_length(trim(p_settings->>'title')),0) not between 1 and 60 then raise exception '場次名稱需為 1～60 字。'; end if;
  expected := (p_settings->>'expected')::integer;
  if expected is null or expected not between 1 and 10000 then raise exception '預估人數需為 1～10000 人。'; end if;
  for i in 0..1 loop
    t := teams->i;
    if (t->>'id') is distinct from (case when i=0 then 'blue' else 'orange' end) then raise exception '隊伍識別碼不正確。'; end if;
    if coalesce(char_length(trim(t->>'name')),0) not between 1 and 12 or coalesce(t->>'color','') !~ '^#[0-9a-fA-F]{6}$' then raise exception '隊名或顏色不正確。'; end if;
    if jsonb_typeof(t->'members') is distinct from 'array' then raise exception '請設定隊伍成員。'; end if;
    if jsonb_array_length(t->'members') not between 1 and 8 then raise exception '每隊需為 1～8 位成員。'; end if;
    for m in select value from jsonb_array_elements(t->'members') loop
      if coalesce(char_length(trim(m->>'name')),0) not between 1 and 16 then raise exception '成員名稱需為 1～16 字。'; end if;
      if char_length(coalesce(m->>'avatar','')) > 2048 then raise exception '圖片網址過長。'; end if;
      if coalesce(m->>'avatar','') <> '' and coalesce(m->>'avatar','') !~ '^(https://|\.\./love-improv/profiles/)' then raise exception '圖片需為 HTTPS 或既有演員路徑。'; end if;
      if (m->>'position') is null or (m->>'position')::numeric not between 0 and 100 then raise exception '裁切位置需為 0～100。'; end if;
    end loop;
  end loop;
  if trim(teams->0->>'name') = trim(teams->1->>'name') then raise exception '兩隊請使用不同名稱。'; end if;
  if octet_length(p_settings::text) > 48000 then raise exception '設定資料過大。'; end if;
  return p_settings;
end $$;

create or replace function public.jlv_get_session(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.jlv_sessions;
begin
  select * into s from public.jlv_sessions where id=p_id;
  if not found then raise exception '找不到這個場次，請重新掃描現場 QR Code。'; end if;
  return to_jsonb(s);
end $$;

create or replace function public.jlv_create_session(p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.jlv_sessions;
begin
  if not public.jlv_is_admin() then raise exception '需要管理員權限。' using errcode='42501'; end if;
  perform public.jlv_validate_settings(p_settings);
  insert into public.jlv_sessions(title,teams,expected)
    values (trim(p_settings->>'title'), p_settings->'teams', (p_settings->>'expected')::integer) returning * into s;
  return to_jsonb(s);
end $$;

create or replace function public.jlv_save_session(p_id uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.jlv_sessions;
begin
  if not public.jlv_is_admin() then raise exception '需要管理員權限。' using errcode='42501'; end if;
  select * into s from public.jlv_sessions where id=p_id for update;
  if not found then raise exception '找不到場次。'; end if;
  if s.status <> 'ready' then raise exception '投票開始後不能修改隊伍，請建立新場次。'; end if;
  perform public.jlv_validate_settings(p_settings);
  update public.jlv_sessions set title=trim(p_settings->>'title'), teams=p_settings->'teams',
    expected=(p_settings->>'expected')::integer, version=version+1 where id=p_id returning * into s;
  return to_jsonb(s);
end $$;

-- Same session-row lock orders opening/closing, configuration and every accepted vote.
-- Retries of the SAME transition are idempotent. Closed sessions can never reopen.
create or replace function public.jlv_set_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.jlv_sessions; totals integer[];
begin
  if not public.jlv_is_admin() then raise exception '需要管理員權限。' using errcode='42501'; end if;
  if p_status is null or p_status not in ('open','closed') then raise exception '狀態不正確。'; end if;
  select * into s from public.jlv_sessions where id=p_id for update;
  if not found then raise exception '找不到場次。'; end if;
  if s.status = p_status then return to_jsonb(s); end if;
  if s.status='ready' and p_status='open' then
    update public.jlv_sessions set status='open', opened_at=clock_timestamp(), version=version+1 where id=p_id returning * into s;
  elsif s.status='open' and p_status='closed' then
    select array[count(*) filter(where team='blue'), count(*) filter(where team='orange')]::integer[]
      into totals from public.jlv_votes where session_id=p_id;
    update public.jlv_sessions set status='closed', counts=totals, closed_at=clock_timestamp(), version=version+1 where id=p_id returning * into s;
  else raise exception '無法進行這個操作；已結束場次不可重開。'; end if;
  return to_jsonb(s);
end $$;

create or replace function public.jlv_my_vote(p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '請先建立投票身分。' using errcode='42501'; end if;
  return (select team from public.jlv_votes where session_id=p_id and voter_id=auth.uid());
end $$;

-- Identity comes only from verified JWT auth.uid(), never from an RPC argument.
-- Existing receipt is returned even after closing so timeout retries can recover.
create or replace function public.jlv_vote(p_id uuid, p_team text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.jlv_sessions; who uuid := auth.uid(); previous text; slot integer;
begin
  if who is null then raise exception '請先建立投票身分。' using errcode='42501'; end if;
  select * into s from public.jlv_sessions where id=p_id for update;
  if not found then raise exception '找不到場次。'; end if;
  select team into previous from public.jlv_votes where session_id=p_id and voter_id=who;
  if found then return jsonb_build_object('session',to_jsonb(s),'team',previous); end if;
  if s.status <> 'open' then raise exception '本場尚未開放或已結束投票。'; end if;
  if p_team is null or p_team not in ('blue','orange') then raise exception '無效的隊伍。'; end if;
  slot := case when p_team='blue' then 1 else 2 end;
  if (s.teams->(slot-1)->>'id') is distinct from p_team then raise exception '隊伍不屬於這個場次。'; end if;
  insert into public.jlv_votes(session_id,voter_id,team) values(p_id,who,p_team);
  update public.jlv_sessions set counts[slot]=counts[slot]+1, version=version+1 where id=p_id returning * into s;
  return jsonb_build_object('session',to_jsonb(s),'team',p_team);
end $$;

create or replace function public.jlv_history() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.jlv_is_admin() then raise exception '需要管理員權限。' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from
    (select * from public.jlv_sessions order by created_at desc limit 50) s), '[]'::jsonb);
end $$;

revoke all on function public.jlv_is_admin() from public, anon, authenticated;
revoke all on function public.jlv_validate_settings(jsonb) from public, anon, authenticated;
revoke all on function public.jlv_get_session(uuid) from public, anon, authenticated;
revoke all on function public.jlv_create_session(jsonb) from public, anon, authenticated;
revoke all on function public.jlv_save_session(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.jlv_set_status(uuid,text) from public, anon, authenticated;
revoke all on function public.jlv_my_vote(uuid) from public, anon, authenticated;
revoke all on function public.jlv_vote(uuid,text) from public, anon, authenticated;
revoke all on function public.jlv_history() from public, anon, authenticated;
grant execute on function public.jlv_is_admin(), public.jlv_get_session(uuid) to anon, authenticated;
grant execute on function public.jlv_create_session(jsonb), public.jlv_save_session(uuid,jsonb), public.jlv_set_status(uuid,text),
  public.jlv_my_vote(uuid), public.jlv_vote(uuid,text), public.jlv_history() to authenticated;

-- Publish only aggregate sessions. Individual votes and admin identities stay private.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and
    not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jlv_sessions') then
    alter publication supabase_realtime add table public.jlv_sessions;
  end if;
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and
    not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jlv_signals') then
    alter publication supabase_realtime add table public.jlv_signals;
  end if;
end $$;
comment on table public.jlv_sessions is 'Public live-vote aggregate snapshots; no voter identities.';
comment on table public.jlv_votes is 'One immutable ballot per session/auth identity; own-row reads only.';
comment on function public.jlv_vote(uuid,text) is 'Atomically accept one ballot and update aggregate under a session lock.';
comment on function public.jlv_set_status(uuid,text) is 'Admin-only transition; close recounts authoritative ballots under the same lock.';
commit;
