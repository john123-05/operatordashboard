'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { Attraction, Park, ParkCamera } from '@/lib/types';

type CameraPhotoRow = {
  id: string;
  captured_at: string;
  storage_bucket: string;
  storage_path: string;
};

type CameraPhotoPreview = CameraPhotoRow & {
  image_url: string | null;
};

const formatCapturedAt = (value: string) =>
  new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

export default function CamerasPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [selectedParkId, setSelectedParkId] = useState('');
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [cameras, setCameras] = useState<ParkCamera[]>([]);
  const [selectedPreviewCameraCode, setSelectedPreviewCameraCode] = useState('');
  const [cameraPhotos, setCameraPhotos] = useState<CameraPhotoPreview[]>([]);
  const [cameraPhotosLoading, setCameraPhotosLoading] = useState(false);
  const [cameraPhotosError, setCameraPhotosError] = useState<string | null>(null);
  const [customerCode, setCustomerCode] = useState('');
  const [cameraName, setCameraName] = useState('');
  const [selectedAttractionId, setSelectedAttractionId] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraPhotosLoadToken = useRef(0);

  const attractionMap = useMemo(() => new Map(attractions.map((a) => [a.id, a.name])), [attractions]);
  const selectedPreviewCamera = useMemo(
    () => cameras.find((camera) => camera.customer_code === selectedPreviewCameraCode) || null,
    [cameras, selectedPreviewCameraCode],
  );

  const authHeader = async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ''}` };
  };

  const loadParks = async () => {
    const { data, error: parksError } = await supabaseBrowser
      .from('parks')
      .select('id, slug, name, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (parksError) {
      setError(parksError.message);
      return;
    }

    const list = (data || []) as Park[];
    setParks(list);
    if (list.length && !selectedParkId) {
      setSelectedParkId(list[0].id);
    }
  };

  const loadParkData = async (parkId: string) => {
    if (!parkId) return;
    const [{ data: attrData, error: attrError }, { data: camData, error: camError }] = await Promise.all([
      supabaseBrowser
        .from('attractions')
        .select('id, park_id, slug, name, is_active')
        .eq('park_id', parkId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabaseBrowser
        .from('park_cameras')
        .select('id, park_id, customer_code, camera_name, attraction_id, is_active')
        .eq('park_id', parkId)
        .order('customer_code', { ascending: true }),
    ]);

    if (attrError) {
      setError(attrError.message);
      return;
    }
    if (camError) {
      setError(camError.message);
      return;
    }

    setAttractions((attrData || []) as Attraction[]);
    setCameras((camData || []) as ParkCamera[]);
  };

  const loadCameraPhotos = async (parkId: string, cameraCode: string) => {
    if (!parkId || !cameraCode) {
      setCameraPhotos([]);
      setCameraPhotosError(null);
      return;
    }

    const loadToken = ++cameraPhotosLoadToken.current;
    setCameraPhotosLoading(true);
    setCameraPhotosError(null);

    try {
      const strategies = [
        { codeColumn: 'camera_code', withPark: true },
        { codeColumn: 'camera_code', withPark: false },
        { codeColumn: 'source_customer_code', withPark: true },
        { codeColumn: 'source_customer_code', withPark: false },
      ] as const;

      let rows: CameraPhotoRow[] | null = null;
      let lastError: string | null = null;

      for (const strategy of strategies) {
        let query = supabaseBrowser
          .from('photos')
          .select('id, captured_at, storage_bucket, storage_path')
          .eq(strategy.codeColumn, cameraCode)
          .order('captured_at', { ascending: false })
          .limit(12);

        if (strategy.withPark) {
          query = query.eq('park_id', parkId);
        }

        const { data, error: photosError } = await query;
        if (photosError) {
          lastError = photosError.message;
          continue;
        }

        rows = (data || []) as CameraPhotoRow[];
        break;
      }

      if (loadToken !== cameraPhotosLoadToken.current) return;

      if (!rows) {
        setCameraPhotos([]);
        setCameraPhotosError(lastError || 'Bilder konnten nicht geladen werden.');
        return;
      }

      if (!rows.length) {
        setCameraPhotos([]);
        setCameraPhotosError(null);
        return;
      }

      const pathsByBucket = new Map<string, Set<string>>();
      for (const row of rows) {
        const currentPaths = pathsByBucket.get(row.storage_bucket) || new Set<string>();
        currentPaths.add(row.storage_path);
        pathsByBucket.set(row.storage_bucket, currentPaths);
      }

      const urlMap = new Map<string, string>();

      for (const [bucket, pathSet] of pathsByBucket.entries()) {
        const paths = Array.from(pathSet);
        const { data: signedData } = await supabaseBrowser.storage.from(bucket).createSignedUrls(paths, 1800);

        for (const signed of signedData || []) {
          if (signed.path && signed.signedUrl) {
            urlMap.set(`${bucket}/${signed.path}`, signed.signedUrl);
          }
        }

        for (const path of paths) {
          const key = `${bucket}/${path}`;
          if (urlMap.has(key)) continue;
          const { data: publicData } = supabaseBrowser.storage.from(bucket).getPublicUrl(path);
          if (publicData.publicUrl) {
            urlMap.set(key, publicData.publicUrl);
          }
        }
      }

      if (loadToken !== cameraPhotosLoadToken.current) return;

      setCameraPhotos(
        rows.map((row) => ({
          ...row,
          image_url: urlMap.get(`${row.storage_bucket}/${row.storage_path}`) || null,
        })),
      );
      setCameraPhotosError(null);
    } catch (loadError) {
      if (loadToken !== cameraPhotosLoadToken.current) return;
      setCameraPhotos([]);
      setCameraPhotosError(loadError instanceof Error ? loadError.message : 'Bilder konnten nicht geladen werden.');
    } finally {
      if (loadToken === cameraPhotosLoadToken.current) {
        setCameraPhotosLoading(false);
      }
    }
  };

  useEffect(() => { loadParks(); }, []);
  useEffect(() => { if (selectedParkId) loadParkData(selectedParkId); }, [selectedParkId]);
  useEffect(() => {
    if (!cameras.length) {
      setSelectedPreviewCameraCode('');
      setCameraPhotos([]);
      setCameraPhotosError(null);
      return;
    }

    const currentExists = cameras.some((camera) => camera.customer_code === selectedPreviewCameraCode);
    if (!currentExists) {
      setSelectedPreviewCameraCode(cameras[0].customer_code);
    }
  }, [cameras, selectedPreviewCameraCode]);
  useEffect(() => {
    if (!selectedParkId || !selectedPreviewCameraCode) return;
    void loadCameraPhotos(selectedParkId, selectedPreviewCameraCode);
  }, [selectedParkId, selectedPreviewCameraCode]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const res = await fetch('/api/admin/park-cameras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        park_id: selectedParkId,
        customer_code: customerCode,
        camera_name: cameraName || null,
        attraction_id: selectedAttractionId || null,
        is_active: true,
      }),
    });

    const body = await res.json();
    if (!res.ok) {
      setError(body.error || 'Kamera-Mapping konnte nicht gespeichert werden');
      return;
    }

    setStatus('Kamera-Mapping gespeichert');
    setCustomerCode('');
    setCameraName('');
    setSelectedAttractionId('');
    await loadParkData(selectedParkId);
  };

  const onDelete = async (cameraId: string, code: string) => {
    if (!confirm(`Kamera-Code "${code}" wirklich löschen?`)) return;
    setError(null);
    setStatus(null);
    setDeletingId(cameraId);

    try {
      const res = await fetch(`/api/admin/park-cameras?id=${encodeURIComponent(cameraId)}`, {
        method: 'DELETE',
        headers: await authHeader(),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Kamera konnte nicht gelöscht werden');
        return;
      }

      setStatus('Kamera gelöscht');
      await loadParkData(selectedParkId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid two">
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Kamera-Mapping</h2>
        <div className="row">
          <div>
            <label>Park</label>
            <select
              value={selectedParkId}
              onChange={(e) => {
                setSelectedPreviewCameraCode('');
                setCameraPhotos([]);
                setCameraPhotosError(null);
                setSelectedParkId(e.target.value);
              }}
            >
              {parks.map((park) => (
                <option key={park.id} value={park.id}>{park.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Neue Kamera-Zuordnung</h3>
        <form className="grid" onSubmit={onCreate}>
          <div>
            <label>Customer/Camera Code (4-stellig)</label>
            <input value={customerCode} onChange={(e) => setCustomerCode(e.target.value.replace(/\D/g, '').slice(0, 4))} required />
          </div>
          <div>
            <label>Kamera Name (optional)</label>
            <input value={cameraName} onChange={(e) => setCameraName(e.target.value)} />
          </div>
          <div>
            <label>Attraktion</label>
            <select value={selectedAttractionId} onChange={(e) => setSelectedAttractionId(e.target.value)}>
              <option value="">Keine Zuordnung</option>
              {attractions.map((attraction) => (
                <option key={attraction.id} value={attraction.id}>{attraction.name}</option>
              ))}
            </select>
          </div>
          <button type="submit">Speichern</button>
        </form>
      </div>

      <div className="card">
        <h3>Aktuelle Zuordnungen</h3>
        <table className="table">
          <thead><tr><th>Code</th><th>Kamera</th><th>Attraktion</th><th>Status</th><th>Aktionen</th></tr></thead>
          <tbody>
            {cameras.map((camera) => (
              <tr key={camera.id}>
                <td>{camera.customer_code}</td>
                <td>{camera.camera_name || '-'}</td>
                <td>{camera.attraction_id ? attractionMap.get(camera.attraction_id) || camera.attraction_id : '-'}</td>
                <td><span className={`badge ${camera.is_active ? 'ok' : 'warn'}`}>{camera.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
                <td>
                  <button
                    type="button"
                    className="danger inline"
                    onClick={() => onDelete(camera.id, camera.customer_code)}
                    disabled={deletingId === camera.id}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h3>Aktuelle Kamera-Bilder</h3>
        <div className="row" style={{ alignItems: 'end' }}>
          <div>
            <label>Kamera</label>
            <select
              value={selectedPreviewCameraCode}
              onChange={(e) => setSelectedPreviewCameraCode(e.target.value)}
              disabled={!cameras.length}
            >
              {!cameras.length && <option value="">Keine Kamera verfügbar</option>}
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.customer_code}>
                  {camera.camera_name ? `${camera.camera_name} (${camera.customer_code})` : `Kamera ${camera.customer_code}`}
                </option>
              ))}
            </select>
          </div>
          <div style={{ maxWidth: 180 }}>
            <button
              type="button"
              className="secondary"
              onClick={() => void loadCameraPhotos(selectedParkId, selectedPreviewCameraCode)}
              disabled={!selectedPreviewCameraCode || cameraPhotosLoading}
            >
              Aktualisieren
            </button>
          </div>
        </div>

        {selectedPreviewCamera && (
          <p className="note" style={{ marginTop: 12 }}>
            Neueste Bilder für {selectedPreviewCamera.camera_name || `Kamera ${selectedPreviewCamera.customer_code}`}.
          </p>
        )}
        {cameraPhotosLoading && <p className="note">Bilder werden geladen...</p>}
        {!cameraPhotosLoading && cameraPhotosError && <p className="error">{cameraPhotosError}</p>}
        {!cameraPhotosLoading && !cameraPhotosError && selectedPreviewCameraCode && cameraPhotos.length === 0 && (
          <p className="note">Für diese Kamera wurden noch keine Bilder gefunden.</p>
        )}

        {!cameraPhotosLoading && cameraPhotos.length > 0 && (
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            {cameraPhotos.map((photo) => (
              <figure
                key={photo.id}
                style={{
                  margin: 0,
                  border: '1px solid var(--hairline)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'rgba(255, 255, 255, 0.45)',
                }}
              >
                {photo.image_url ? (
                  <img
                    src={photo.image_url}
                    alt={`Kamera ${selectedPreviewCameraCode}`}
                    loading="lazy"
                    style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div
                    style={{
                      height: 140,
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--muted)',
                      fontSize: 12,
                      padding: 10,
                    }}
                  >
                    Kein Bild verfügbar
                  </div>
                )}
                <figcaption style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)' }}>
                  {formatCapturedAt(photo.captured_at)}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
