-- 公開控制權遷移：允許任何連線者呼叫控制 RPC。
-- 在 Supabase Dashboard → SQL Editor 執行一次；不會刪除或重設任何資料。
-- 注意：投影網址是公開網址，取得網址的人都能操作投票及修改隊伍。
begin;

create or replace function public.jlv_live_access(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select true;
$$;

commit;
