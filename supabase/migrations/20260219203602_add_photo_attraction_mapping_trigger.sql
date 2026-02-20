/*
  # Keep photos.attraction_id in sync with park_cameras by camera_code

  ## Why
  Ingestion writes `camera_code` from parsed filename. This trigger ensures
  attraction assignment stays consistent via `park_id + camera_code`.
*/

CREATE OR REPLACE FUNCTION public.assign_photo_attraction_from_camera_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only try to map when park and camera code are available.
  IF NEW.park_id IS NULL OR NEW.camera_code IS NULL OR NEW.camera_code = '' THEN
    RETURN NEW;
  END IF;

  SELECT pc.attraction_id
  INTO NEW.attraction_id
  FROM public.park_cameras pc
  WHERE pc.park_id = NEW.park_id
    AND pc.customer_code = NEW.camera_code
    AND pc.is_active = true
  ORDER BY pc.updated_at DESC NULLS LAST, pc.created_at DESC NULLS LAST
  LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_photo_assign_attraction ON public.photos;

CREATE TRIGGER on_photo_assign_attraction
  BEFORE INSERT OR UPDATE OF park_id, camera_code
  ON public.photos
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_photo_attraction_from_camera_code();

-- Backfill current data with active camera mappings
UPDATE public.photos p
SET attraction_id = pc.attraction_id
FROM public.park_cameras pc
WHERE p.park_id = pc.park_id
  AND p.camera_code = pc.customer_code
  AND pc.is_active = true
  AND p.attraction_id IS DISTINCT FROM pc.attraction_id;
