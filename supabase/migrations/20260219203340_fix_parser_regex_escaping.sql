/*
  # Fix parser regex escaping after migration 20260219203208

  Replaces fragile backslash patterns with explicit character classes
  and re-runs photos backfill.
*/

CREATE OR REPLACE FUNCTION public._ingest_filename_stem(path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(COALESCE(path, ''), '^.*/', ''),
      '[.][^.]+$',
      ''
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.parse_speed_kmh(path text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  stem text;
  stem_no_suffix text;
  suffix_speed text;
  legacy_speed text;
BEGIN
  stem := public._ingest_filename_stem(path);
  IF stem IS NULL THEN
    RETURN 0;
  END IF;

  suffix_speed := (regexp_match(stem, '[_-][sS]([0-9]{4})$'))[1];
  IF suffix_speed IS NOT NULL THEN
    RETURN (suffix_speed::numeric / 100.0);
  END IF;

  stem_no_suffix := regexp_replace(stem, '[_-][sS][0-9]{4}$', '');
  IF stem_no_suffix ~ '^[0-9]{20}$' THEN
    RETURN (right(stem_no_suffix, 4)::numeric / 100.0);
  END IF;

  legacy_speed := (regexp_match(path, '([0-9]{1,3}[,.][0-9]{1,2})[[:space:]]*km/h', 'i'))[1];
  IF legacy_speed IS NOT NULL THEN
    RETURN replace(legacy_speed, ',', '.')::numeric;
  END IF;

  RETURN 0;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$;

-- Re-backfill using corrected regex logic
WITH parsed AS (
  SELECT
    p.id,
    public.parse_source_customer_code(p.storage_path) AS customer_code,
    public.parse_source_time_code(p.storage_path) AS time_code,
    public.parse_source_file_code(p.storage_path) AS file_code,
    public.parse_speed_kmh(p.storage_path) AS speed_kmh
  FROM public.photos p
  WHERE p.storage_path IS NOT NULL
)
UPDATE public.photos p
SET
  source_customer_code = parsed.customer_code,
  source_time_code = parsed.time_code,
  source_file_code = parsed.file_code,
  source_speed_kmh = parsed.speed_kmh,
  camera_code = parsed.customer_code,
  speed_kmh = CASE WHEN p.speed_kmh IS NULL OR p.speed_kmh = 0 THEN parsed.speed_kmh ELSE p.speed_kmh END
FROM parsed
WHERE p.id = parsed.id
  AND (
    p.source_customer_code IS DISTINCT FROM parsed.customer_code
    OR p.source_time_code IS DISTINCT FROM parsed.time_code
    OR p.source_file_code IS DISTINCT FROM parsed.file_code
    OR p.source_speed_kmh IS DISTINCT FROM parsed.speed_kmh
    OR p.camera_code IS DISTINCT FROM parsed.customer_code
    OR p.speed_kmh IS NULL
    OR p.speed_kmh = 0
  );
