-- Server-side aggregation for the admin visitor analytics dashboard.
-- Previously the API pulled the last 500 rows and aggregated in JS, which
-- silently undercounted totals once traffic exceeded the cap.

CREATE OR REPLACE FUNCTION get_visitor_analytics(days_back INT)
RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
WITH bounds AS (
  SELECT
    NOW() - (days_back || ' days')::INTERVAL                   AS since,
    NOW() - (2 * days_back || ' days')::INTERVAL               AS prev_since,
    NOW() - (days_back || ' days')::INTERVAL                   AS prev_until
),
scoped AS (
  SELECT * FROM site_visitors, bounds WHERE visited_at >= bounds.since
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
    to_char(visited_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
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
    EXTRACT(HOUR FROM visited_at AT TIME ZONE 'UTC')::INT AS hour,
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
