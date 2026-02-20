# Liftpictures Operator Dashboard

Separate Next.js Admin-Webapp zur Verwaltung von:
- Parks
- Park Path Prefixes (`park_slug/...`)
- Attraktionen
- Kamera-Codes (`customer_code -> attraction`)
- Ingestion Parse Preview

## Dateiname-Parsing (Ingestion Check)

- Erwartet einen numerischen 16-stelligen Kern (optional plus Speed):
  - `XXXXXXXXXXXXYYYY` (ohne Speed)
  - `XXXXXXXXXXXXYYYYZZZZ` (mit Speed als letzte 4 Stellen)
  - `XXXXXXXXXXXXYYYY_SZZZZ` (Legacy-Speed-Suffix bleibt kompatibel)
- `customerCode` wird aus festen Stellen des 16er-Kerns gebildet:
  - Positionen `1, 9, 4, 10` (A/B/C/D-Schema)
- Legacy-Fallback bleibt aktiv:
  - erste 4 Stellen als `legacyCustomerCode`
- `speedKmh`:
  - letzte 4 Stellen oder `_SZZZZ` werden als `/100` interpretiert
  - wenn keine Speed im Dateinamen vorhanden ist: `0`

## Setup

1. `.env.example` kopieren nach `.env.local`
2. Werte setzen:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPPORT_SYNC_SECRET`
3. `npm install`
4. `npm run dev`

## Admin-Zugriff

Ein User muss in `public.admin_users` eingetragen sein:

```sql
insert into public.admin_users (user_id)
values ('<AUTH_USER_ID>')
on conflict (user_id) do nothing;
```

## Support Ticket Sync (Quellprojekt -> Zielprojekt)

Das Dashboard ist read-only und erwartet, dass Tickets aus einem anderen Supabase-Projekt per Webhook synchronisiert werden.

### Zielprojekt (dieses Dashboard)

1. `SUPPORT_SYNC_SECRET` in `.env.local` setzen.
2. Endpoint (Deployment-URL): `POST /api/support-sync`
3. Endpoint erwartet Header:
   - `x-support-sync-secret: <SUPPORT_SYNC_SECRET>`
   - alternativ `Authorization: Bearer <SUPPORT_SYNC_SECRET>`

### Quellprojekt (wo Tickets erstellt werden)

In Supabase -> `Database` -> `Webhooks` zwei Webhooks anlegen:

1. Tabelle `support_tickets`
   - Events: `INSERT`, `UPDATE`, `DELETE`
   - URL: `https://<DEINE-DASHBOARD-DOMAIN>/api/support-sync`
   - Header: `x-support-sync-secret: <SUPPORT_SYNC_SECRET>`
2. Tabelle `support_ticket_messages`
   - Events: `INSERT`, `UPDATE`, `DELETE`
   - URL und Header identisch

Der Endpoint verarbeitet die Supabase-Webhook-Payload idempotent:
- `INSERT`/`UPDATE` -> `upsert` per `id`
- `DELETE` -> `delete` per `id`
