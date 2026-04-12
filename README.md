# OCO -- 3B Vendor Portal

A Next.js vendor management portal with interactive scorecards, market visit tracking, real-time notifications, two-factor authentication, and a read-only brand client portal -- all backed by Supabase.

## Features

### Scorecard Grid
Interactive data grid (AG Grid) with Excel/CSV import/export, inline editing, subgrid support, template management, and 1.5-second debounced auto-save with dirty detection and deduplication.

### Brand Client Portal
Admin creates brand users with temporary passwords (forced change on first login). Brand users log in to `/portal` for a read-only dashboard showing their product status across retailers.

### Two-Factor Authentication (2FA)
TOTP-based 2FA via otplib and QR codes. Available for both ADMIN and BRAND roles. Supports trusted devices (30-day window verified with HMAC-SHA256). TOTP secrets are encrypted at rest. Middleware enforces 2FA on all protected routes.

### Admin Settings
Security settings page at `/admin/settings` with a 2FA enable/disable toggle and QR code setup flow.

### Client Logo Management
Admin uploads, reorders, renames, and deletes brand logos at `/admin/client-logos`. Logos are stored in the `client-logos` Supabase Storage bucket with metadata in the `client_logos` database table. The landing page carousel fetches logos from the database instead of hardcoded URLs.

### Password Confirmation
Creating or deleting brand users requires admin password re-entry. Rate-limited to 5 attempts with escalating lockout. Uses a throwaway Supabase client to avoid session corruption.

### Notification System
Real-time notifications when brand users add comments. Bell icon with unread count badge. Clicking a notification navigates to the exact scorecard row and opens the comment drawer.

### Market Visits
Photo upload with geolocation tagging, reverse geocoding, and brand tracking.

### Master Scorecard
Aggregated retailer penetration analytics per product.

### Comments
Per-cell commenting system with local-to-database scorecard migration.

### Landing Page
Dynamic content with service highlights, territory stats (4,029 doors across MN/WI/ND/SD), database-driven client logo carousel, and frosted glass header.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth, httpOnly cookie sessions, JWT |
| 2FA | otplib (TOTP), qrcode (QR generation), bcrypt (password hashing) |
| Styling | Tailwind CSS 3 |
| Data Grid | AG Grid, React Data Grid |
| File Processing | XLSX (Excel/CSV import/export) |
| Image Handling | Supabase Storage, Exifr (EXIF metadata) |
| Validation | Zod |
| UI | Sonner (toasts), React Select, React DatePicker, React Icons, Swiper |
| Testing | Playwright |

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

## Authentication

The portal uses two roles:

| Role | Access |
|------|--------|
| **ADMIN** | Full access to scorecards, market visits, brand user management, settings, client logos, and notifications |
| **BRAND** | Read-only portal at `/portal` showing product status across retailers, with commenting ability |

### Auth Flow

1. User logs in via Supabase Auth. Session tokens are stored in httpOnly cookies.
2. If 2FA is enabled for the account, the user is redirected to `/auth/2fa` to enter a TOTP code.
3. Trusted device tokens (HMAC-SHA256 signed, 30-day expiry) allow skipping 2FA on recognized browsers.
4. Brand users with a temporary password are forced to change it on first login.
5. Middleware (`src/middleware.ts`) protects all `/admin/*` and `/portal/*` routes, enforcing both authentication and 2FA verification.

## Project Structure

```
src/
  app/
    api/
      auth/             # Auth routes (session, logout, me, 2fa, password)
      admin/            # Admin-only routes (brand-users, notifications, login-sessions)
      portal/           # Brand portal routes (dashboard, comments, notifications, market-visits)
      client-logos/     # Client logo CRUD
      scorecards/       # Scorecard CRUD + cells + history
      comments/         # Comment CRUD
      market-visits/    # Market visit photos with geolocation
      master-scorecard/ # Aggregated penetration analytics
      templates/        # Grid template CRUD
      brands/           # Brand listing
    admin/
      client-logos/     # Logo management page
      clients/          # Client management
      dashboard/        # Admin dashboard
      market-visits/    # Market visit management
      settings/         # Security settings (2FA toggle)
    auth/               # Login / register / logout / 2FA pages
    portal/             # Brand client portal (read-only dashboard)
    customer/           # Customer detail pages
    orders/             # Order management
  components/
    admin/
      AdminDataGrid.tsx           # Main scorecard grid
      AdminDataGridContext.tsx     # Shared React context for grid state
      AdminHeader.tsx             # Admin header with nav tabs + user menu
      ScorecardSidebar.tsx        # Scorecard list sidebar
      GridToolbar.tsx             # Grid toolbar (import/export, actions)
      CommentDrawer.tsx           # Slide-out comment panel
      SubGridRenderer.tsx         # Subgrid row renderer
      GridModals.tsx              # Modal dialogs (confirm, rename, template)
      NotificationBell.tsx        # Bell icon with unread count
      MasterScorecard.tsx         # Aggregated analytics view
      MarketVisitGallery.tsx      # Photo gallery with lightbox
      MarketVisitUpload.tsx       # Photo upload with geolocation
      useColumnDefinitions.tsx    # Column builders + cell renderers hook
      useCommentHandlers.ts       # Comment CRUD hook
      useSubGridHandlers.ts       # Subgrid CRUD + templates hook
      useScrollPrevention.ts      # Scroll lock hook
    auth/
      AuthButtons.tsx             # Login/register UI
    layout/
      Header.tsx                  # Landing page header
      Logo.tsx                    # Logo component
    portal/
      PortalNotificationBell.tsx  # Brand user notification bell
    ui/
      SaveStatus.tsx              # Auto-save status indicator
      MobileErrorBoundary.tsx     # Mobile-specific error boundary
      SafariErrorBoundary.tsx     # Safari-specific error boundary
  constants/            # Brand definitions
  middleware.ts         # Auth + 2FA middleware (route protection)
lib/
  supabaseAdmin.ts      # Server-side Supabase client (service role)
  supabaseClient.ts     # Client-side Supabase client (anon key)
  apiAuth.ts            # API route auth helper
  crypto.ts             # TOTP secret encryption/decryption
  features.ts           # Feature flag utilities
  schemas.ts            # Shared Zod schemas
  logger.ts             # Production-safe logger
supabase/
  migrations/           # SQL migration files (tables, RLS, triggers, 2FA, notifications, client logos)
  seed.sql              # Local development seed data
public/                 # Static assets (logos, images)
scripts/                # Utility scripts (data import, DB helpers)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Playwright tests |
| `npm run test:headed` | Run Playwright tests in headed mode |
| `npm run test:debug` | Run Playwright tests in debug mode |
| `npm run test:report` | Show Playwright test report |
| `npm run db` | Run database utility script |

## API Routes

### Auth

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/auth/set-session` | POST | Set auth cookies from Supabase tokens |
| `/api/auth/me` | GET | Get current authenticated user |
| `/api/auth/logout` | POST | Clear session cookies |
| `/api/auth/2fa/setup` | GET, POST, DELETE | Generate, confirm, or disable TOTP 2FA |
| `/api/auth/2fa/verify` | POST | Verify a TOTP code and issue trusted device token |
| `/api/auth/verify-password` | POST | Re-verify admin password (for destructive actions) |
| `/api/auth/change-password` | POST | Change user password |
| `/api/auth/log-session` | POST | Log a login session for audit trail |

### Admin

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/admin/brand-users` | GET, POST | List or create brand users |
| `/api/admin/brand-users/[id]` | PUT, DELETE | Update or delete a brand user |
| `/api/admin/brand-users/[id]/reset-password` | POST | Reset a brand user password |
| `/api/admin/notifications` | GET, PATCH | Fetch or mark-read admin notifications |
| `/api/admin/login-sessions` | GET | Fetch login session audit log |

### Scorecards

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/scorecards` | GET, POST, PUT | CRUD for user scorecards |
| `/api/scorecards/[id]` | GET, PUT, DELETE | Single scorecard operations |
| `/api/scorecards/[id]/cells` | GET, PUT | Cell-level reads and updates |
| `/api/scorecards/[id]/history` | GET | Cell change audit trail |

### Comments and Templates

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/comments` | GET, POST | Scorecard comments |
| `/api/comments/[id]` | PUT, DELETE | Edit/delete comments |
| `/api/templates` | GET, POST | Grid templates |
| `/api/templates/[id]` | GET, PUT, DELETE | Single template operations |

### Market Visits and Analytics

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/market-visits` | GET, POST | Market visit photos with geolocation |
| `/api/market-visits/[id]` | DELETE | Remove a market visit |
| `/api/master-scorecard` | GET | Aggregated penetration analytics |

### Brand Portal

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/portal/dashboard` | GET | Brand user dashboard data |
| `/api/portal/comments` | GET, POST | Brand user comments |
| `/api/portal/notifications` | GET | Brand user notifications |
| `/api/portal/market-visits` | GET | Brand-scoped market visits |

### Client Logos and Brands

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/client-logos` | GET, POST, PUT | List, upload, or reorder client logos |
| `/api/client-logos/[id]` | PUT, DELETE | Update or delete a client logo |
| `/api/brands` | GET | List all brands |

## Security

- **Credentials** -- All secrets live in `.env.local` (gitignored). Never hardcode API keys or secrets in source.
- **Service Role Key** -- Bypasses RLS; used only server-side in API routes via `supabaseAdmin`. Never exposed to the client.
- **Row Level Security** -- All tables have RLS enabled with user-scoped policies.
- **Auth Sessions** -- Stored in httpOnly cookies. Tokens validated server-side via `supabaseAdmin.auth.getUser()`.
- **Two-Factor Authentication** -- TOTP secrets are encrypted with AES before storage. Trusted device tokens are signed with HMAC-SHA256 and expire after 30 days. Middleware enforces 2FA on all protected routes when enabled.
- **Password Confirmation** -- Destructive admin actions (creating/deleting brand users) require password re-entry. Rate-limited to 5 attempts with escalating lockout periods. Uses a throwaway Supabase auth client to prevent session corruption.
- **Logging** -- `lib/logger.ts` silences debug/info in production to prevent information disclosure.
- **File Uploads** -- Validated for MIME type (JPEG, PNG, WebP, HEIC), extension whitelist, and 10 MB size limit.
- **JWT** -- `JWT_SECRET` is required at startup; the app will fail to start without it.

## Deployment

1. Deploy to Vercel (or similar) and set all environment variables from `.env.local`
2. Ensure `JWT_SECRET` is set -- the app crashes at startup without it
3. Run database migrations against your production Supabase instance (includes tables for scorecards, comments, market visits, 2FA, notifications, login sessions, brand users, and client logos)
4. Configure Supabase Storage buckets:
   - `market-photos` -- market visit photo uploads
   - `client-logos` -- brand logo uploads for the landing page carousel
5. Verify RLS policies are active on all tables

## License

This project is private and proprietary.
