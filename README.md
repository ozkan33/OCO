# 3B Vendor Portal

A Next.js vendor management portal with interactive scorecards, market visit tracking, and real-time data management backed by Supabase.

## Features

- **Scorecard Grid**: Interactive data grid with Excel/CSV import/export, inline editing, subgrid support, and template management
- **Market Visits**: Photo upload with geolocation tagging and brand tracking
- **Master Scorecard**: Aggregated retailer penetration analytics
- **Comments**: Per-cell commenting system with scorecard migration support
- **Authentication**: Supabase Auth with cookie-based sessions and role-based access (ADMIN / VENDOR)

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Styling**: Tailwind CSS
- **Data Grid**: React Data Grid
- **File Processing**: XLSX for Excel/CSV import/export

## Prerequisites

- Node.js v18+
- A [Supabase](https://supabase.com) project

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd OCO
npm install
```

### 2. Configure environment

Copy the template and fill in your Supabase credentials:

```bash
cp env-template.txt .env.local
```

Edit `.env.local` with values from your Supabase dashboard (Settings > API):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=a-long-random-secret-string
```

> **Never commit `.env.local` or any file containing real credentials.**

### 3. Set up the database

Run migrations in your Supabase SQL Editor (Dashboard > SQL Editor), or use the Supabase CLI:

```bash
npx supabase db push
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
    api/          # API routes (auth, scorecards, comments, market-visits)
    admin/        # Admin pages (market visits)
    auth/         # Login page
  components/     # React components
  constants/      # Brand definitions, etc.
lib/              # Shared utilities (supabaseAdmin, apiAuth, logger)
supabase/
  migrations/     # SQL migration files
  seed.sql        # Local development seed data
public/           # Static assets
scripts/          # Utility scripts (data import)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Security Notes

- **Credentials**: All secrets must be in `.env.local` (gitignored). Never hardcode API keys, service role keys, or JWT secrets in source files.
- **Service Role Key**: The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It is only used server-side in API routes via `supabaseAdmin`. Never expose it to the client.
- **RLS**: All database tables have Row Level Security enabled. Policies enforce user-scoped access.
- **Auth**: Sessions are stored in httpOnly cookies. Tokens are validated server-side via `supabaseAdmin.auth.getUser()`.
- **Logging**: API routes use `lib/logger.ts` which silences debug/info output in production to prevent information disclosure.
- **File Uploads**: Market visit photos are validated for MIME type (JPEG, PNG, WebP, HEIC), file extension whitelist, and 10MB size limit.

## Deployment

1. Deploy to Vercel (or similar) and set all environment variables from `.env.local`
2. Ensure `JWT_SECRET` is set — the app will fail to start without it
3. Run database migrations against your production Supabase instance

## License

This project is private and proprietary.
