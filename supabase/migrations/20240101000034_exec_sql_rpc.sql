-- exec_sql: privileged RPC for running arbitrary SQL from trusted scripts.
-- Callable only by the service_role key (never anon/authenticated), so it is
-- safe to ship. Returns aggregated rows as JSONB for SELECT-like queries,
-- and { ok: true, command: '...' } for DDL/DML.

drop function if exists public.exec_sql(text);

create or replace function public.exec_sql(query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  stripped   text := rtrim(btrim(query), ';');
  first_word text := upper(coalesce((regexp_match(stripped, '^\s*([A-Za-z]+)'))[1], ''));
  out_json   jsonb;
begin
  if first_word in ('SELECT', 'WITH', 'SHOW', 'EXPLAIN', 'VALUES', 'TABLE') then
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (%s) as x',
      stripped
    ) into out_json;
    return out_json;
  end if;

  execute query;
  return jsonb_build_object('ok', true, 'command', first_word);
end;
$fn$;

revoke all on function public.exec_sql(text) from public;
revoke all on function public.exec_sql(text) from anon;
revoke all on function public.exec_sql(text) from authenticated;
grant execute on function public.exec_sql(text) to service_role;

comment on function public.exec_sql(text) is
  'Privileged SQL runner for scripts/sql.ts. service_role only. Not for app code.';
