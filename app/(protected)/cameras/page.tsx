'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { Attraction, Park, ParkCamera } from '@/lib/types';

export default function CamerasPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [selectedParkId, setSelectedParkId] = useState('');
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [cameras, setCameras] = useState<ParkCamera[]>([]);
  const [customerCode, setCustomerCode] = useState('');
  const [cameraName, setCameraName] = useState('');
  const [selectedAttractionId, setSelectedAttractionId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attractionMap = useMemo(() => new Map(attractions.map((a) => [a.id, a.name])), [attractions]);

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

  useEffect(() => { loadParks(); }, []);
  useEffect(() => { if (selectedParkId) loadParkData(selectedParkId); }, [selectedParkId]);

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

  return (
    <div className="grid two">
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Kamera-Mapping</h2>
        <div className="row">
          <div>
            <label>Park</label>
            <select value={selectedParkId} onChange={(e) => setSelectedParkId(e.target.value)}>
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
          <thead><tr><th>Code</th><th>Kamera</th><th>Attraktion</th><th>Status</th></tr></thead>
          <tbody>
            {cameras.map((camera) => (
              <tr key={camera.id}>
                <td>{camera.customer_code}</td>
                <td>{camera.camera_name || '-'}</td>
                <td>{camera.attraction_id ? attractionMap.get(camera.attraction_id) || camera.attraction_id : '-'}</td>
                <td><span className={`badge ${camera.is_active ? 'ok' : 'warn'}`}>{camera.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
