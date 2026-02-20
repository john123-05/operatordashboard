/*
  # Update Ingestion Parsers: New Camera Code Layout + Trailing Speed

  ## Changes
  - `parse_source_customer_code(path)` now extracts code from fixed positions in the 16-char core:
    - positions 1, 9, 4, 10 (1-based)
  - `parse_source_time_code(path)` keeps positions 5-12 from the 16-char core.
  - `parse_source_file_code(path)` keeps positions 13-16 from the 16-char core.
  - `parse_speed_kmh(path)` supports:
    - trailing 4 digits in 20-char numeric filenames (`...XXXXXXXXYYYY` + `ZZZZ` => `ZZ.ZZ`)
    - `_SZZZZ` or `-SZZZZ` suffix
    - legacy `12,34 km/h` text fallback
    - default `0` when not present

  ## Backfill
  Updates existing `public.photos` source fields and camera code using the new parser logic.
*/

-- Helper: filename without path prefix and extension
CREATE OR REPLACE FUNCTION public._ingest_filename_stem(path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(COALESCE(path, ''), '^.*/', ''),
      '\\.[^.]+$',
      ''
    ),
    ''
  );
$$;

-- Helper: normalized 16-char numeric core from filename
CREATE OR REPLACE FUNCTION public._ingest_core_16(path text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  stem text;
  stem_no_suffix text;
BEGIN
  stem := public._ingest_filename_stem(path);
  IF stem IS NULL THEN
    RETURN NULL;
  END IF;

  -- remove optional _S#### / -S#### suffix before core detection
  stem_no_suffix := regexp_replace(stem, '[_-][sS][0-9]{4}$', '');

  IF stem_no_suffix ~ '^[0-9]{16}$' THEN
    RETURN stem_no_suffix;
  END IF;

  IF stem_no_suffix ~ '^[0-9]{20}$' THEN
    RETURN left(stem_no_suffix, 16);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.parse_source_customer_code(path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN core IS NULL THEN NULL
    ELSE substr(core, 1, 1) || substr(core, 9, 1) || substr(core, 4, 1) || substr(core, 10, 1)
  END
  FROM (SELECT public._ingest_core_16(path) AS core) s;
$$;

CREATE OR REPLACE FUNCTION public.parse_source_time_code(path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN core IS NULL THEN NULL
    ELSE substr(core, 5, 8)
  END
  FROM (SELECT public._ingest_core_16(path) AS core) s;
$$;

CREATE OR REPLACE FUNCTION public.parse_source_file_code(path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN core IS NULL THEN NULL
    ELSE substr(core, 13, 4)
  END
  FROM (SELECT public._ingest_core_16(path) AS core) s;
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

  -- Preferred: explicit suffix _S#### / -S####
  suffix_speed := (regexp_match(stem, '[_-][sS]([0-9]{4})$'))[1];
  IF suffix_speed IS NOT NULL THEN
    RETURN (suffix_speed::numeric / 100.0);
  END IF;

  -- Preferred: trailing 4 digits in a 20-digit numeric filename
  stem_no_suffix := regexp_replace(stem, '[_-][sS][0-9]{4}$', '');
  IF stem_no_suffix ~ '^[0-9]{20}$' THEN
    RETURN (right(stem_no_suffix, 4)::numeric / 100.0);
  END IF;

  -- Legacy fallback: textual speed in filename/path, e.g. "27,89 km/h"
  legacy_speed := (regexp_match(path, '(\\d{1,3}[,\\.]\\d{1,2})\\s*km/h', 'i'))[1];
  IF legacy_speed IS NOT NULL THEN
    RETURN replace(legacy_speed, ',', '.')::numeric;
  END IF;

  RETURN 0;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$;

-- Backfill existing rows with new parsing logic
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
  speed_kmh = COALESCE(p.speed_kmh, parsed.speed_kmh)
FROM parsed
WHERE p.id = parsed.id
  AND (
    p.source_customer_code IS DISTINCT FROM parsed.customer_code
    OR p.source_time_code IS DISTINCT FROM parsed.time_code
    OR p.source_file_code IS DISTINCT FROM parsed.file_code
    OR p.source_speed_kmh IS DISTINCT FROM parsed.speed_kmh
    OR p.camera_code IS DISTINCT FROM parsed.customer_code
    OR p.speed_kmh IS NULL
  );
