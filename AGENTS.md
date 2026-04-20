# AGENTS.md

Project context + token-efficiency rules for Claude Code (Opus). **Read this first.**

---

## Token budget: read this section literally

1. **Never full-Read files > 500 lines.** Use Grep to find the target, then `Read` with `offset`+`limit`. The biggest offenders:
   - [src/components/admin/AdminDataGrid.tsx](src/components/admin/AdminDataGrid.tsx) — 2,519 lines
   - [src/app/portal/page.tsx](src/app/portal/page.tsx) — 1,921 lines
   - [src/components/admin/useColumnDefinitions.tsx](src/components/admin/useColumnDefinitions.tsx) — 872 lines
   - [src/components/admin/GridModals.tsx](src/components/admin/GridModals.tsx) — 729 lines
   - [src/components/admin/SubGridRenderer.tsx](src/components/admin/SubGridRenderer.tsx) — 665 lines

2. **Don't re-Read after Edit.** Edit/Write errors if the change failed — the harness tracks state. Re-reading wastes thousands of tokens.

3. **Prefer Grep / Glob over Read.** Looking for a symbol? `Grep pattern:"symbolName"`. Looking for a file? `Glob pattern:"**/*Foo*.tsx"`. Only Read once you know the line range.

4. **Parallelize independent tool calls.** One message with multiple Grep/Read/Bash calls, not sequential.

5. **Delegate sprawling research (>3 queries) to the Explore subagent.** Targeted lookups — do them directly; subagents have their own startup cost.

6. **Don't spawn agents for single-file edits.** Agents are for isolation, breadth, or specialist knowledge — not convenience.

7. **No narration of internal reasoning.** One short sentence before the first tool call, brief status on direction changes, end-of-turn one-liner. That's it.

8. **No post-edit recap of what the code does.** The diff is the recap. Say what changed and why, not line-by-line what each change does.

9. **Match response length to task.** Simple question = direct answer. Don't add headers/sections to a one-line reply.

10. **Skip the mandatory summary table / "three options" format** unless the user explicitly asked for analysis. For implementation requests, just implement and report under 5 lines.

---

## Domain (the business)

- **Scorecard** = per-brand workspace. Owned by an internal user (broker). One per brand (JoMomma's, Cry Baby Craig's, Nature Blessed, …).
- **Rows** = retailers / chains (BROWN'S, COBORNS, CUB FOODS, …).
- **Columns** = products (Hot Sauce, Hot Honey, …) + system columns (priority, buyer, comments).
- **Cell** = authorization status (Authorized, In Process, Buyer Passed, Presented, Discontinued, Meeting Secured, On Hold, Category Review, Open Review, In/Out).
- **Subgrid** = per-chain store list; each sub-row is a store with its own per-product statuses.
- **Master Scorecard** = pivot view: brands across, chains down. Expandable to show stores.
- **Brand portal** (`/portal`) = read-ish view for brand users (clients) — they see their own status across retailers. Admin creates these users via [src/app/admin/clients/](src/app/admin/clients/).
- **Market visits** = photos + notes from store visits, shown on admin + portal.
- **Weekly summary** = AI-generated Monday "Your Week in Review" email to brand clients.

---

## Landmarks (jump straight here)

| Area | File(s) |
|---|---|
| Scorecard grid (admin) | [src/components/admin/AdminDataGrid.tsx](src/components/admin/AdminDataGrid.tsx), [AdminDataGridContext.tsx](src/components/admin/AdminDataGridContext.tsx) |
| Column definitions | [src/components/admin/useColumnDefinitions.tsx](src/components/admin/useColumnDefinitions.tsx) |
| Subgrid (stores under chain) | [src/components/admin/SubGridRenderer.tsx](src/components/admin/SubGridRenderer.tsx), [useSubGridHandlers.ts](src/components/admin/useSubGridHandlers.ts) |
| Master Scorecard UI | [src/components/admin/MasterScorecard.tsx](src/components/admin/MasterScorecard.tsx) |
| Master Scorecard API | [src/app/api/master-scorecard/route.ts](src/app/api/master-scorecard/route.ts), [src/app/api/portal/master-scorecard/route.ts](src/app/api/portal/master-scorecard/route.ts) |
| Comments / threads | [src/components/admin/CommentDrawer.tsx](src/components/admin/CommentDrawer.tsx), [useCommentHandlers.ts](src/components/admin/useCommentHandlers.ts), [src/app/api/comments/](src/app/api/comments/), [src/app/api/portal/comments/](src/app/api/portal/comments/) |
| Market visits | [src/components/admin/MarketVisitUpload.tsx](src/components/admin/MarketVisitUpload.tsx), [MarketVisitGallery.tsx](src/components/admin/MarketVisitGallery.tsx), [src/app/api/market-visits/](src/app/api/market-visits/) |
| Brand portal page | [src/app/portal/page.tsx](src/app/portal/page.tsx) |
| Portal APIs | [src/app/api/portal/](src/app/api/portal/) |
| Weekly email | [src/lib/weeklyEmail.ts](src/lib/weeklyEmail.ts), [src/lib/weeklySummary.ts](src/lib/weeklySummary.ts), [src/app/api/admin/weekly-summary/](src/app/api/admin/weekly-summary/), [src/app/api/cron/weekly-summary/](src/app/api/cron/weekly-summary/) |
| Auth helpers | [src/lib/apiAuth.ts](src/lib/apiAuth.ts), [src/lib/supabaseAdmin.ts](src/lib/supabaseAdmin.ts) |
| Admin pages | [src/app/admin/](src/app/admin/) |
| DB migrations | [supabase/migrations/](supabase/migrations/) |

---

## Stack facts (don't re-discover)

- **Next.js 15** App Router, React 19, TypeScript, Tailwind.
- **Supabase** (Postgres + auth) via service-role `supabaseAdmin` on the server, JWT in `getUserFromToken()`.
- **react-data-grid** for the admin scorecard grid (not ag-grid despite the dep).
- **Resend** for transactional email.
- **Playwright** for e2e (`npm run test`). There are pre-existing errors in [e2e/fixtures/dummyScorecard.ts](e2e/fixtures/dummyScorecard.ts) and [e2e/crypto.spec.ts](e2e/crypto.spec.ts) — not yours, ignore them when typechecking.
- **Dev**: `npm run dev`. **Typecheck**: `npx tsc --noEmit`. **Lint**: `npm run lint`.
- **Windows host, bash shell** — use Unix paths, not `NUL` or backslashes in commands.

---

## User preferences (durable)

- Pointed, small-scope fixes. Don't sprawl a bug fix into refactors.
- No comments unless the WHY is non-obvious.
- Terse responses. End with 1–2 sentences max.
- No emojis in code or chat unless asked.
- When file-editing via agents, always use `isolation: "worktree"` for parallel runs.
- Logos / retailer names on the landing page must stay big and readable.

---

## Data-model gotchas (saves re-reading)

- **System columns** (non-product) are hardcoded in both master-scorecard routes: `name, priority, retail_price, category_review_date, buyer, store_count, route_to_market, hq_location, cmg, brand_lead, comments, _delete_row`. Anything else under `columns[]` is a product.
- **Store sub-row status lookup**: `sr[`product_${pc.key}`] ?? sr[pc.key]`. If the sub-row has no explicit status, it used to inherit from the parent chain (this was a recent bug — inherited entries are now flagged with `inherited: true` and excluded from per-store %).
- **Retailer column** is detected by `col.name in {"Customer","Customer Name","Retailer Name"} || col.key === "name"`.
- **Brand user assignments**: `brand_user_assignments` table — maps user → scorecard_id + allowed `product_columns[]`.
- **Authorization check** is case-insensitive string compare: `status.toLowerCase() === 'authorized'`.

---

## When in doubt

1. Grep for the feature name.
2. Check [MEMORY.md index](C:/Users/kahve/.claude/projects/c--Users-kahve-OneDrive-Desktop-OCO/memory/MEMORY.md) — it already captures preferences and business-model notes.
3. Ask before destructive git ops (`reset --hard`, force-push, branch delete).
