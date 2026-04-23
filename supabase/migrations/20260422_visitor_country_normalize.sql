-- Backfill: collapse ISO country codes into full names so the visitor
-- analytics dashboard stops showing "US" and "United States" as two
-- separate buckets. New rows are normalized in the API
-- (src/app/api/visitors/route.ts → ISO_TO_COUNTRY_NAME); this just
-- cleans up historical rows that were inserted with the raw ISO code
-- from x-vercel-ip-country / cf-ipcountry headers.
UPDATE site_visitors SET country = 'United States' WHERE country = 'US';
UPDATE site_visitors SET country = 'United Kingdom' WHERE country IN ('GB', 'UK', 'Great Britain');
UPDATE site_visitors SET country = 'Canada' WHERE country = 'CA';
UPDATE site_visitors SET country = 'Ireland' WHERE country = 'IE';
UPDATE site_visitors SET country = 'Netherlands' WHERE country = 'NL';
UPDATE site_visitors SET country = 'Germany' WHERE country = 'DE';
UPDATE site_visitors SET country = 'France' WHERE country = 'FR';
UPDATE site_visitors SET country = 'Spain' WHERE country = 'ES';
UPDATE site_visitors SET country = 'Italy' WHERE country = 'IT';
UPDATE site_visitors SET country = 'Portugal' WHERE country = 'PT';
UPDATE site_visitors SET country = 'Belgium' WHERE country = 'BE';
UPDATE site_visitors SET country = 'Switzerland' WHERE country = 'CH';
UPDATE site_visitors SET country = 'Austria' WHERE country = 'AT';
UPDATE site_visitors SET country = 'Sweden' WHERE country = 'SE';
UPDATE site_visitors SET country = 'Norway' WHERE country = 'NO';
UPDATE site_visitors SET country = 'Denmark' WHERE country = 'DK';
UPDATE site_visitors SET country = 'Finland' WHERE country = 'FI';
UPDATE site_visitors SET country = 'Poland' WHERE country = 'PL';
UPDATE site_visitors SET country = 'Czechia' WHERE country = 'CZ';
UPDATE site_visitors SET country = 'Greece' WHERE country = 'GR';
UPDATE site_visitors SET country = 'Turkey' WHERE country = 'TR';
UPDATE site_visitors SET country = 'Russia' WHERE country = 'RU';
UPDATE site_visitors SET country = 'Ukraine' WHERE country = 'UA';
UPDATE site_visitors SET country = 'Australia' WHERE country = 'AU';
UPDATE site_visitors SET country = 'New Zealand' WHERE country = 'NZ';
UPDATE site_visitors SET country = 'Japan' WHERE country = 'JP';
UPDATE site_visitors SET country = 'South Korea' WHERE country = 'KR';
UPDATE site_visitors SET country = 'China' WHERE country = 'CN';
UPDATE site_visitors SET country = 'Hong Kong' WHERE country = 'HK';
UPDATE site_visitors SET country = 'Taiwan' WHERE country = 'TW';
UPDATE site_visitors SET country = 'Singapore' WHERE country = 'SG';
UPDATE site_visitors SET country = 'Malaysia' WHERE country = 'MY';
UPDATE site_visitors SET country = 'Thailand' WHERE country = 'TH';
UPDATE site_visitors SET country = 'Vietnam' WHERE country = 'VN';
UPDATE site_visitors SET country = 'Philippines' WHERE country = 'PH';
UPDATE site_visitors SET country = 'Indonesia' WHERE country = 'ID';
UPDATE site_visitors SET country = 'India' WHERE country = 'IN';
UPDATE site_visitors SET country = 'Pakistan' WHERE country = 'PK';
UPDATE site_visitors SET country = 'Bangladesh' WHERE country = 'BD';
UPDATE site_visitors SET country = 'United Arab Emirates' WHERE country = 'AE';
UPDATE site_visitors SET country = 'Saudi Arabia' WHERE country = 'SA';
UPDATE site_visitors SET country = 'Israel' WHERE country = 'IL';
UPDATE site_visitors SET country = 'Egypt' WHERE country = 'EG';
UPDATE site_visitors SET country = 'South Africa' WHERE country = 'ZA';
UPDATE site_visitors SET country = 'Nigeria' WHERE country = 'NG';
UPDATE site_visitors SET country = 'Kenya' WHERE country = 'KE';
UPDATE site_visitors SET country = 'Mexico' WHERE country = 'MX';
UPDATE site_visitors SET country = 'Brazil' WHERE country = 'BR';
UPDATE site_visitors SET country = 'Argentina' WHERE country = 'AR';
UPDATE site_visitors SET country = 'Chile' WHERE country = 'CL';
UPDATE site_visitors SET country = 'Colombia' WHERE country = 'CO';
UPDATE site_visitors SET country = 'Peru' WHERE country = 'PE';
UPDATE site_visitors SET country = 'Venezuela' WHERE country = 'VE';
