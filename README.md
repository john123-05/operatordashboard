# Liftpictures Operator Dashboard

Separate Next.js Admin-Webapp zur Verwaltung von:
- Parks
- Park Path Prefixes (`park_slug/...`)
- Attraktionen
- Kamera-Codes (`customer_code -> attraction`)
- Ingestion Parse Preview

## Setup

1. `.env.example` kopieren nach `.env.local`
2. Werte setzen:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
3. `npm install`
4. `npm run dev`

## Admin-Zugriff

Ein User muss in `public.admin_users` eingetragen sein:

```sql
insert into public.admin_users (user_id)
values ('<AUTH_USER_ID>')
on conflict (user_id) do nothing;
```
