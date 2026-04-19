-- Server-side aggregation for the admin User Activity dashboard.
-- Previously the API pulled the last N rows and aggregated in JS, which
-- silently undercounted "Logins Today", "Unique Users Today", and
-- "Avg. Session" once traffic exceeded the cap. Mirrors the visitor
-- analytics RPC pattern from 20240101000031.

CREATE OR REPLACE FUNCTION get_activity_analytics(
  days_back    INT  DEFAULT 30,
  result_limit INT  DEFAULT 100,
  role_filter  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
WITH bounds AS (
  SELECT
    NOW() - (days_back || ' days')::INTERVAL         AS since,
    date_trunc('day', NOW() AT TIME ZONE 'UTC')      AS today_start,
    NOW() - INTERVAL '30 minutes'                    AS active_cutoff
),
joined AS (
  SELECT
    ls.id, ls.user_id, ls.email, ls.brand_name,
    ls.login_at, ls.logout_at, ls.duration_minutes,
    ls.ip_address, ls.user_agent, ls.device_trusted, ls.two_factor_used,
    COALESCE(u.raw_user_meta_data->>'role', 'UNKNOWN') AS user_role,
    COALESCE(
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(u.raw_user_meta_data->>'display_name', ''),
      split_part(ls.email, '@', 1)
    ) AS user_name
  FROM login_sessions ls
  LEFT JOIN auth.users u ON u.id = ls.user_id
  CROSS JOIN bounds b
  WHERE ls.login_at >= b.since
    AND ls.ip_address NOT IN ('::1', '127.0.0.1', 'unknown')
),
-- One active session per user: their most-recent session, no logout, within
-- the last 30 minutes. DISTINCT ON dedups the "active" count so a user who
-- reloaded three times in 20 min counts as 1 active user, not 3.
active_sessions AS (
  SELECT DISTINCT ON (j.user_id) j.id
  FROM joined j, bounds b
  WHERE j.logout_at IS NULL AND j.login_at >= b.active_cutoff
  ORDER BY j.user_id, j.login_at DESC
),
filtered AS (
  SELECT * FROM joined
  WHERE role_filter IS NULL OR user_role = role_filter
),
stats AS (
  SELECT
    (SELECT COUNT(*)::BIGINT FROM active_sessions)                                     AS active_now,
    (SELECT COUNT(*)::BIGINT           FROM joined j, bounds b WHERE j.login_at >= b.today_start) AS today_logins,
    (SELECT COUNT(DISTINCT j.user_id)::BIGINT FROM joined j, bounds b WHERE j.login_at >= b.today_start) AS unique_today_users,
    (SELECT COALESCE(ROUND(AVG(duration_minutes))::INT, 0)
       FROM joined WHERE duration_minutes IS NOT NULL)                                 AS avg_session_min,
    (SELECT COUNT(*)::BIGINT FROM joined)                                              AS total_logins
),
role_counts AS (
  SELECT
    COUNT(*)::BIGINT                                       AS all_count,
    COUNT(*) FILTER (WHERE user_role = 'ADMIN')::BIGINT    AS admin_count,
    COUNT(*) FILTER (WHERE user_role = 'BRAND')::BIGINT    AS brand_count
  FROM joined
),
recent AS (
  SELECT
    f.id, f.user_id, f.email, f.brand_name,
    f.login_at, f.logout_at, f.duration_minutes,
    f.ip_address, f.user_agent, f.device_trusted, f.two_factor_used,
    f.user_role, f.user_name,
    (a.id IS NOT NULL) AS is_active
  FROM filtered f
  LEFT JOIN active_sessions a ON a.id = f.id
  ORDER BY f.login_at DESC
  LIMIT result_limit
)
SELECT jsonb_build_object(
  'activeNow',        (SELECT active_now          FROM stats),
  'todayLogins',      (SELECT today_logins        FROM stats),
  'uniqueTodayUsers', (SELECT unique_today_users  FROM stats),
  'avgSessionMin',    (SELECT avg_session_min     FROM stats),
  'totalLogins',      (SELECT total_logins        FROM stats),
  'roleCounts', jsonb_build_object(
    'ALL',    (SELECT all_count    FROM role_counts),
    'ADMIN',  (SELECT admin_count  FROM role_counts),
    'BRAND',  (SELECT brand_count  FROM role_counts)
  ),
  'sessions', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM recent r), '[]'::jsonb)
);
$$;

-- SECURITY DEFINER reads auth.users.raw_user_meta_data, which the anon role
-- cannot see directly. Restrict execution to the service role so this can
-- only be invoked via supabaseAdmin.rpc() from the admin API route.
REVOKE EXECUTE ON FUNCTION get_activity_analytics(INT, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_activity_analytics(INT, INT, TEXT) TO service_role;
