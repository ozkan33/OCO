-- Follow-up to 20240101000036. Two changes:
--   1. Compute the date-range bounds using calendar days in the viewer's
--      local timezone, not a rolling UTC 24h*N window. Without this the first
--      and last daily buckets can be short by several hours for any viewer
--      not on UTC (the labels were already aligned by the prior migration,
--      but the window edges were not).
--   2. Validate the tz argument against pg_timezone_names and fall back to
--      'UTC' for bad input, so a malformed IANA name from the client can't
--      raise at query time. The API route already format-validates, but a
--      syntactically-valid-but-nonexistent zone (e.g. 'Fake/City') would
--      slip past that check.

CREATE OR REPLACE FUNCTION get_visitor_analytics(days_back INT, tz TEXT DEFAULT 'UTC')
RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
WITH safe_tz AS (
  SELECT COALESCE(
    (SELECT name FROM pg_timezone_names WHERE name = tz LIMIT 1),
    'UTC'
  ) AS name
),
bounds AS (
  SELECT
    (date_trunc('day', NOW() AT TIME ZONE s.name) AT TIME ZONE s.name)
      - ((days_back - 1) || ' days')::INTERVAL     AS since,
    (date_trunc('day', NOW() AT TIME ZONE s.name) AT TIME ZONE s.name)
      - ((2 * days_back - 1) || ' days')::INTERVAL AS prev_since,
    (date_trunc('day', NOW() AT TIME ZONE s.name) AT TIME ZONE s.name)
      - ((days_back - 1) || ' days')::INTERVAL     AS prev_until
  FROM safe_tz s
),
scoped AS (
  SELECT sv.* FROM site_visitors sv, bounds b WHERE sv.visited_at >= b.since
),
prev_scoped AS (
  SELECT sv.* FROM site_visitors sv, bounds b
  WHERE sv.visited_at >= b.prev_since AND sv.visited_at < b.prev_until
),
totals AS (
  SELECT
    COUNT(*)::BIGINT                                        AS total_visits,
    COUNT(*) FILTER (WHERE is_unique IS TRUE)::BIGINT       AS unique_visits
  FROM scoped
),
prev_totals AS (
  SELECT
    COUNT(*)::BIGINT                                        AS total_visits,
    COUNT(*) FILTER (WHERE is_unique IS TRUE)::BIGINT       AS unique_visits
  FROM prev_scoped
),
referrers AS (
  SELECT source, count FROM (
    SELECT
      COALESCE(
        NULLIF(regexp_replace(referrer, '^https?://([^/]+).*$', '\1'), referrer),
        'Direct'
      ) AS source,
      COUNT(*)::BIGINT AS count
    FROM scoped
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 15
  ) r
),
pages AS (
  SELECT page, count FROM (
    SELECT page_url AS page, COUNT(*)::BIGINT AS count
    FROM scoped
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 10
  ) p
),
devices AS (
  SELECT
    COUNT(*) FILTER (WHERE device_type = 'desktop')::BIGINT AS desktop,
    COUNT(*) FILTER (WHERE device_type = 'mobile')::BIGINT  AS mobile,
    COUNT(*) FILTER (WHERE device_type = 'tablet')::BIGINT  AS tablet
  FROM scoped
),
countries AS (
  SELECT country, count FROM (
    SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS country, COUNT(*)::BIGINT AS count
    FROM scoped
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 10
  ) c
),
daily AS (
  SELECT
    to_char(visited_at AT TIME ZONE (SELECT name FROM safe_tz), 'YYYY-MM-DD') AS date,
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE is_unique IS TRUE)::BIGINT AS unique
  FROM scoped
  GROUP BY 1
  ORDER BY 1 ASC
),
campaigns AS (
  SELECT label, count FROM (
    SELECT
      COALESCE(
        NULLIF(utm_campaign, ''),
        NULLIF(utm_source, ''),
        NULLIF(utm_medium, '')
      ) AS label,
      COUNT(*)::BIGINT AS count
    FROM scoped
    WHERE (utm_campaign IS NOT NULL AND utm_campaign <> '')
       OR (utm_source   IS NOT NULL AND utm_source   <> '')
       OR (utm_medium   IS NOT NULL AND utm_medium   <> '')
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 8
  ) c
),
hourly AS (
  SELECT
    EXTRACT(HOUR FROM visited_at AT TIME ZONE (SELECT name FROM safe_tz))::INT AS hour,
    COUNT(*)::BIGINT AS count
  FROM scoped
  GROUP BY 1
  ORDER BY 1 ASC
),
recent AS (
  SELECT * FROM scoped ORDER BY visited_at DESC LIMIT 50
)
SELECT jsonb_build_object(
  'totalVisits',      (SELECT total_visits  FROM totals),
  'uniqueVisits',     (SELECT unique_visits FROM totals),
  'prevTotalVisits',  (SELECT total_visits  FROM prev_totals),
  'prevUniqueVisits', (SELECT unique_visits FROM prev_totals),
  'topReferrers',     COALESCE((SELECT jsonb_agg(to_jsonb(r))  FROM referrers r), '[]'::jsonb),
  'topPages',         COALESCE((SELECT jsonb_agg(to_jsonb(p))  FROM pages p),     '[]'::jsonb),
  'deviceCounts',     (SELECT to_jsonb(d) FROM devices d),
  'topCountries',     COALESCE((SELECT jsonb_agg(to_jsonb(c))  FROM countries c), '[]'::jsonb),
  'dailyVisits',      COALESCE((SELECT jsonb_agg(to_jsonb(d))  FROM daily d),     '[]'::jsonb),
  'topCampaigns',     COALESCE((SELECT jsonb_agg(to_jsonb(c))  FROM campaigns c), '[]'::jsonb),
  'hourlyVisits',     COALESCE((SELECT jsonb_agg(to_jsonb(h))  FROM hourly h),    '[]'::jsonb),
  'recentVisitors',   COALESCE((SELECT jsonb_agg(to_jsonb(v))  FROM recent v),    '[]'::jsonb)
);
$$;
