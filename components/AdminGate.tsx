'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace('/login');
        return;
      }

      const { data, error: adminError } = await supabaseBrowser
        .from('admin_users')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (adminError) {
        setError(adminError.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Kein Admin-Zugriff für diesen User. Bitte in public.admin_users eintragen.');
        setLoading(false);
        return;
      }

      setAuthorized(true);
      setLoading(false);
    })();
  }, [router]);

  const tabs = [
    { href: '/parks', label: 'Parks' },
    { href: '/attractions', label: 'Attraktionen' },
    { href: '/cameras', label: 'Kameras' },
    { href: '/support-ticket-kunden', label: 'Support Ticket Kunden' },
    { href: '/ingestion-check', label: 'Ingestion Check' },
  ];

  if (loading) {
    return <div className="container"><p>Lade Admin-Sitzung...</p></div>;
  }

  if (!authorized) {
    return (
      <div className="container">
        <h1>Admin-Zugriff verweigert</h1>
        {error && <p className="error">{error}</p>}
        <Link href="/login" className="note">Zum Login</Link>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topbar card">
        <div className="brand">
          <p className="eyebrow">Liftpictures</p>
          <h1>Operator Dashboard</h1>
        </div>
        <div className="nav-links">
          {tabs.map((tab) => (
            <Link key={tab.href} href={tab.href} className={pathname === tab.href ? 'active' : ''}>
              {tab.label}
            </Link>
          ))}
        </div>
        <button
          className="secondary logout-btn"
          onClick={async () => {
            await supabaseBrowser.auth.signOut();
            window.location.href = '/login';
          }}
        >
          Logout
        </button>
      </div>
      {children}
    </div>
  );
}
