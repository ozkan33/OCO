# OCO — 3B Vendor Portal

A Next.js vendor management portal with interactive scorecards, market visit tracking, and real-time data management backed by Supabase.

## Features

- **Scorecard Grid** — Interactive data grid with Excel/CSV import/export, inline editing, subgrid support, and template management
- **Market Visits** — Photo upload with geolocation tagging, reverse geocoding, and brand tracking
- **Master Scorecard** — Aggregated retailer penetration analytics per product
- **Comments** — Per-cell commenting system with local-to-database scorecard migration
- **Authentication** — Supabase Auth with httpOnly cookie sessions and role-based access (ADMIN / VENDOR)
- **Vendor Portal** — Dedicated vendor-facing interface

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth, httpOnly cookie sessions |
| Styling | Tailwind CSS 3 |
| Data Grid | AG Grid, React Data Grid |
| File Processing | XLSX (Excel/CSV import/export) |
| Image Handling | Supabase Storage, Exifr (EXIF metadata) |
| Validation | Zod |
| UI | Sonner (toasts), React Select, React DatePicker, React Icons, Swiper |

## Prerequisites

- Node.js v18+
- A [Supabase](https://supabase.com) project

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/ozkan33/OCO.git
cd OCO
npm install
```

### 2. Configure environment

```bash
cp env-template.txt .env.local
```

Edit `.env.local` with values from your Supabase dashboard (**Settings > API**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=a-long-random-secret-string
```

> **Never commit `.env.local` or any file containing real credentials.**

### 3. Set up the database

Run migrations via the Supabase CLI or in the SQL Editor (Dashboard > SQL Editor):

```bash
npx supabase db push
```

For local development with seed data:

```bash
npx supabase db reset
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/
    api/              # API routes (auth, scorecards, comments, market-visits, templates)
    admin/            # Admin pages (market visits management)
    auth/             # Login / register / logout pages
    customer/         # Customer detail pages
    orders/           # Order management
  components/         # React components (admin, auth, layout, grid)
  constants/          # Brand definitions
  middleware.ts       # Auth middleware (route protection)
lib/                  # Shared utilities
  supabaseAdmin.ts    # Server-side Supabase client (service role)
  supabaseClient.ts   # Client-side Supabase client (anon key)
  apiAuth.ts          # API route auth helper
  logger.ts           # Production-safe logger
  auth.ts             # JWT utilities
supabase/
  migrations/         # SQL migration files (RLS, tables, triggers)
  seed.sql            # Local development seed data
public/               # Static assets (logos, images)
scripts/              # Utility scripts (data import)
vendor-portal/        # Vendor-facing portal
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## API Routes

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/auth/set-session` | POST | Set auth cookies from Supabase tokens |
| `/api/auth/me` | GET | Get current authenticated user |
| `/api/auth/logout` | POST | Clear session cookies |
| `/api/scorecards` | GET, POST, PUT | CRUD for user scorecards |
| `/api/scorecards/[id]` | GET, PUT, DELETE | Single scorecard operations |
| `/api/scorecards/[id]/cells` | GET, PUT | Cell-level reads and updates |
| `/api/scorecards/[id]/history` | GET | Cell change audit trail |
| `/api/comments` | GET, POST | Scorecard comments |
| `/api/comments/[id]` | PUT, DELETE | Edit/delete comments |
| `/api/market-visits` | GET, POST | Market visit photos with geolocation |
| `/api/market-visits/[id]` | DELETE | Remove a market visit |
| `/api/master-scorecard` | GET | Aggregated penetration analytics |
| `/api/templates` | GET, POST | Grid templates |
| `/api/templates/[id]` | GET, PUT, DELETE | Single template operations |

## Security

- **Credentials** — All secrets live in `.env.local` (gitignored). Never hardcode API keys or secrets in source.
- **Service Role Key** — Bypasses RLS; used only server-side in API routes via `supabaseAdmin`. Never exposed to client.
- **Row Level Security** — All tables have RLS enabled with user-scoped policies.
- **Auth** — Sessions stored in httpOnly cookies. Tokens validated server-side via `supabaseAdmin.auth.getUser()`.
- **Logging** — `lib/logger.ts` silences debug/info in production to prevent information disclosure.
- **File Uploads** — Validated for MIME type (JPEG, PNG, WebP, HEIC), extension whitelist, and 10 MB size limit.
- **JWT** — `JWT_SECRET` is required at startup; the app will fail to start without it.

## Deployment

1. Deploy to Vercel (or similar) and set all environment variables from `.env.local`
2. Ensure `JWT_SECRET` is set — the app crashes at startup without it
3. Run database migrations against your production Supabase instance
4. Configure Supabase Storage bucket `market-photos` with appropriate policies

## License

This project is private and proprietary.
