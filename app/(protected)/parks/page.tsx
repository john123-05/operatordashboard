'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { Park, ParkPathPrefix } from '@/lib/types';

export default function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [prefixes, setPrefixes] = useState<ParkPathPrefix[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parkForPrefix, setParkForPrefix] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeader = async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ''}` };
  };

  const load = async () => {
    const { data: parksData, error: parksError } = await supabaseBrowser
      .from('parks')
      .select('id, slug, name, is_active')
      .order('name', { ascending: true });
    if (parksError) {
      setError(parksError.message);
      return;
    }

    const { data: prefixData, error: prefixError } = await supabaseBrowser
      .from('park_path_prefixes')
      .select('id, park_id, path_prefix, is_active')
      .order('path_prefix', { ascending: true });

    if (prefixError) {
      setError(prefixError.message);
      return;
    }

    setParks((parksData || []) as Park[]);
    setPrefixes((prefixData || []) as ParkPathPrefix[]);
    if ((parksData || []).length && !parkForPrefix) {
      setParkForPrefix(parksData![0].id);
    }
  };

  useEffect(() => { load(); }, []);

  const createPark = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const res = await fetch('/api/admin/parks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ name, slug, is_active: true }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(body.error || 'Park konnte nicht erstellt werden');
      return;
    }

    setStatus('Park gespeichert');
    setName('');
    setSlug('');
    await load();
  };

  const createPrefix = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const res = await fetch('/api/admin/park-prefixes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ park_id: parkForPrefix, path_prefix: pathPrefix, is_active: true }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(body.error || 'Prefix konnte nicht gespeichert werden');
      return;
    }

    setStatus('Prefix gespeichert');
    setPathPrefix('');
    await load();
  };

  return (
    <div className="grid two">
      <div className="card">
        <h2>Park anlegen</h2>
        <form className="grid" onSubmit={createPark}>
          <div>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label>Slug</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="plose-plosebob" required />
          </div>
          <button type="submit">Speichern</button>
        </form>
      </div>

      <div className="card">
        <h2>Path Prefix mappen</h2>
        <p className="note">Upload-Pfad muss mit Prefix starten: `prefix/dateiname.jpg`</p>
        <form className="grid" onSubmit={createPrefix}>
          <div>
            <label>Park</label>
            <select value={parkForPrefix} onChange={(e) => setParkForPrefix(e.target.value)}>
              {parks.map((park) => (
                <option key={park.id} value={park.id}>{park.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Prefix</label>
            <input value={pathPrefix} onChange={(e) => setPathPrefix(e.target.value.trim())} placeholder="plose-plosebob" required />
          </div>
          <button type="submit">Prefix speichern</button>
        </form>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Parks</h2>
        <table className="table">
          <thead><tr><th>Name</th><th>Slug</th><th>Status</th></tr></thead>
          <tbody>
            {parks.map((park) => (
              <tr key={park.id}>
                <td>{park.name}</td>
                <td>{park.slug}</td>
                <td><span className={`badge ${park.is_active ? 'ok' : 'warn'}`}>{park.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Prefix-Mappings</h2>
        <table className="table">
          <thead><tr><th>Prefix</th><th>Park ID</th><th>Status</th></tr></thead>
          <tbody>
            {prefixes.map((prefix) => (
              <tr key={prefix.id}>
                <td>{prefix.path_prefix}</td>
                <td>{prefix.park_id}</td>
                <td><span className={`badge ${prefix.is_active ? 'ok' : 'warn'}`}>{prefix.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
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
