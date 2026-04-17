// Weekly brand summary engine.
//
// Pipeline:
//   1. gatherBrandWeekData(brand, weekOf)   → structured activity for the week
//   2. generateWeeklySummary(data)          → Gemini-written markdown recap
//   3. persistWeeklySummary(data, summary)  → upsert into weekly_summaries
//
// Called by:
//   - /api/cron/weekly-summary (scheduled, Monday mornings)
//   - /api/cron/weekly-summary?brand=X&week=YYYY-MM-DD (manual backfill/test)

import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { logger } from '../../lib/logger';

const MODEL = 'gemini-2.5-flash';
const DEFAULT_COLUMN_KEYS = new Set([
  'name', 'priority', 'retail_price', 'buyer', 'store_count', 'hq_location',
  'cmg', 'category_review_date', 'route_to_market', 'comments', '_delete_row', 'notes',
]);

export interface VisitItem {
  date: string;
  store: string;
  address: string;
  note: string;
  storeComments: Array<{ author: string; text: string; date: string }>;
}

export interface StatusChange {
  date: string;
  retailer: string;
  product: string;
  from: string;
  to: string;
}

export interface ScorecardNote {
  date: string;
  retailer: string;
  author: string;
  text: string;
}

export interface BrandWeekData {
  brandName: string;
  weekOf: string;      // ISO date (Monday)
  weekEnd: string;     // ISO date (Sunday)
  visits: VisitItem[];
  statusChanges: StatusChange[];
  scorecardNotes: ScorecardNote[];
  stats: {
    visitCount: number;
    storeCount: number;
    statusChangeCount: number;
    scorecardNoteCount: number;
  };
}

/** Returns the Monday (00:00 UTC) on or before the given date. */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Gather a brand's activity for the 7-day window starting at weekOf (Monday). */
export async function gatherBrandWeekData(brandName: string, weekOf: Date): Promise<BrandWeekData> {
  const windowStart = new Date(weekOf);
  const windowEnd = new Date(weekOf);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);
  const startISO = windowStart.toISOString();
  const endISO = windowEnd.toISOString();
  const startDate = toISODate(windowStart);
  const endDate = toISODate(new Date(windowEnd.getTime() - 1));

  // Scorecard IDs for this brand: by title match, or by any brand_user_assignment.
  const { data: scByTitle } = await supabaseAdmin
    .from('user_scorecards')
    .select('id, title, data, user_id')
    .ilike('title', brandName);
  const { data: assignments } = await supabaseAdmin
    .from('brand_user_assignments')
    .select('scorecard_id')
    .eq('brand_name', brandName);

  const scorecardIds = new Set<string>();
  (scByTitle || []).forEach((s: { id: string }) => scorecardIds.add(s.id));
  (assignments || []).forEach((a: { scorecard_id: string }) => scorecardIds.add(a.scorecard_id));
  const idList = Array.from(scorecardIds);

  // Load full scorecard rows/columns for retailer/product name lookup.
  const scorecardById = new Map<string, { rows: Array<{ id: number | string; name?: string }>; columns: Array<{ key: string; name?: string; label?: string }> }>();
  if (idList.length > 0) {
    const { data: scorecards } = await supabaseAdmin
      .from('user_scorecards')
      .select('id, data')
      .in('id', idList);
    for (const sc of scorecards || []) {
      scorecardById.set(sc.id, {
        rows: sc.data?.rows || [],
        columns: sc.data?.columns || [],
      });
    }
  }

  // Market visits in window.
  const { data: rawVisits } = await supabaseAdmin
    .from('market_visits')
    .select('id, visit_date, store_name, address, note, brands')
    .contains('brands', [brandName])
    .gte('visit_date', startDate)
    .lte('visit_date', endDate)
    .order('visit_date', { ascending: true });
  const visits = rawVisits || [];

  // Comments whose row_id matches any visited store_name, within this brand's scorecards.
  const storeNames = Array.from(new Set(visits.map((v: { store_name: string | null }) => v.store_name).filter(Boolean) as string[]));
  const commentsByStore = new Map<string, Array<{ text: string; created_at: string; user_email: string | null; user_id: string | null }>>();
  if (idList.length > 0 && storeNames.length > 0) {
    const { data: storeComments } = await supabaseAdmin
      .from('comments')
      .select('row_id, text, user_email, user_id, created_at')
      .in('scorecard_id', idList)
      .in('row_id', storeNames)
      .gte('created_at', startISO)
      .lt('created_at', endISO)
      .order('created_at', { ascending: true });
    for (const c of storeComments || []) {
      const key = String(c.row_id);
      if (!commentsByStore.has(key)) commentsByStore.set(key, []);
      commentsByStore.get(key)!.push(c);
    }
  }

  const authorCache = new Map<string, string>();
  async function authorName(userId: string | null, email: string | null): Promise<string> {
    if (!userId) return email ? email.split('@')[0] : 'Team';
    if (authorCache.has(userId)) return authorCache.get(userId)!;
    const { data: profile } = await supabaseAdmin
      .from('brand_user_profiles')
      .select('contact_name')
      .eq('id', userId)
      .maybeSingle();
    let name = profile?.contact_name;
    if (!name) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      name = authUser?.user?.user_metadata?.name || authUser?.user?.email?.split('@')[0] || 'Team';
    }
    authorCache.set(userId, name);
    return name;
  }

  const visitItems: VisitItem[] = [];
  for (const v of visits) {
    const storeKey = String(v.store_name || '');
    const raw = commentsByStore.get(storeKey) || [];
    const storeComments = [] as VisitItem['storeComments'];
    for (const c of raw) {
      storeComments.push({
        author: await authorName(c.user_id, c.user_email),
        text: c.text,
        date: c.created_at,
      });
    }
    visitItems.push({
      date: v.visit_date,
      store: v.store_name || 'Unknown store',
      address: v.address || '',
      note: v.note || '',
      storeComments,
    });
  }

  // Status changes on product columns (ignore default info columns).
  const statusChanges: StatusChange[] = [];
  if (idList.length > 0) {
    const { data: history } = await supabaseAdmin
      .from('scorecard_cell_history')
      .select('scorecard_id, row_id, column_key, old_value, new_value, changed_at')
      .in('scorecard_id', idList)
      .gte('changed_at', startISO)
      .lt('changed_at', endISO)
      .order('changed_at', { ascending: true });
    for (const h of history || []) {
      if (DEFAULT_COLUMN_KEYS.has(h.column_key)) continue;
      const sc = scorecardById.get(h.scorecard_id);
      const retailer = sc?.rows.find((r) => String(r.id) === String(h.row_id))?.name || 'Unknown retailer';
      const col = sc?.columns.find((c) => c.key === h.column_key);
      const product = col?.name || col?.label || h.column_key;
      statusChanges.push({
        date: h.changed_at,
        retailer,
        product,
        from: h.old_value || '',
        to: h.new_value || '',
      });
    }
  }

  // Scorecard notes added in window (row-level comments, not on visit stores).
  const scorecardNotes: ScorecardNote[] = [];
  if (idList.length > 0) {
    const { data: scComments } = await supabaseAdmin
      .from('comments')
      .select('scorecard_id, row_id, text, user_id, user_email, created_at')
      .in('scorecard_id', idList)
      .gte('created_at', startISO)
      .lt('created_at', endISO)
      .order('created_at', { ascending: true });
    for (const c of scComments || []) {
      // Skip visit-store comments (already captured above).
      if (storeNames.includes(String(c.row_id))) continue;
      const sc = scorecardById.get(c.scorecard_id);
      const retailer = sc?.rows.find((r) => String(r.id) === String(c.row_id))?.name || 'Unknown retailer';
      scorecardNotes.push({
        date: c.created_at,
        retailer,
        author: await authorName(c.user_id, c.user_email),
        text: c.text,
      });
    }
  }

  return {
    brandName,
    weekOf: startDate,
    weekEnd: endDate,
    visits: visitItems,
    statusChanges,
    scorecardNotes,
    stats: {
      visitCount: visitItems.length,
      storeCount: storeNames.length,
      statusChangeCount: statusChanges.length,
      scorecardNoteCount: scorecardNotes.length,
    },
  };
}

const SYSTEM_PROMPT = `You write the weekly "Your Week in Review" recap that appears at the top of a brand's client portal at 3 Brothers Marketing, a food brokerage. The brand already knows who you are — this card sits inside their branded portal. Your job is to show them, concretely, what their brokerage team did for them this week.

VOICE
- A trusted partner giving a real, grounded update — not a form email.
- Warm and human, but never cloying or cheerful for its own sake. No "we're excited to share" energy.
- Confident and concrete. Specificity is the whole point: *which* store, *what* price, *which* flavor, *which* buyer. Vague totals are worthless.
- Plain English. No corporate jargon, no emojis, no filler adjectives.

WHAT TO OMIT (CRITICAL)
- No greeting. Do NOT start with "Hello [Brand] team," "Hi team," "Dear," or any salutation. Jump straight into substance.
- No sign-off. Do NOT end with "Best regards," "The 3 Brothers Marketing Team," "Thanks," "Cheers," or any signature block. The closing sentence should just be the last real sentence of the recap.
- No meta-framing like "Here's your weekly update" or "This week's summary." Just give them the update.

OPENING
- Start with a single sentence that sets the scope of the week in a natural, factual way. ALWAYS use digits (e.g. "15", "8", "22") for the visit/store count, not spelled-out words ("fifteen", "eight"). Examples of good first sentences:
  - "15 store visits across the Twin Cities this week, with a few things worth calling out."
  - "Quieter week — 8 stops, mostly routine, but one reorder moving at Kowalski's Stillwater."
  - "Busy stretch: 22 visits, a Target authorization on Chipotle Salsa, and two pricing shifts we're watching."
- The opener names the shape of the week. It does not greet anyone.

PROGRESS THIS WEEK (only if there are status changes)
- Use a bold header like **Progress** and bullet each change in plain English:
  - "- Target authorized Chipotle Salsa."
  - "- Whole Foods moved Spicy Mustard from In Process to Presented."
- Skip this entire section (header included) if there were no status changes.

FROM THE FIELD
- This is the heart of the recap. Use a bold header like **From the field**.
- One bullet per store, or per observation. Name the store in every bullet. Include city only when it disambiguates (e.g., multiple Kowalski's).
- Quote the concrete detail: prices, out-of-stocks, promo end dates, buyer comments, competitor moves, distributor mentions. Rephrase rep notes into clean client-facing language — do not copy verbatim and do not drop the specifics.
- Good bullets look like:
  - "- Jerry's Woodbury: fully stocked, and Royal Foods distribution is confirmed."
  - "- Kowalski's Shoreview: shelves full — sauce holding at $6.29, honey at $13.99."
  - "- Lunds & Byerlys Eden Prairie: inventory running low after the $4.99 sale wrapped on the 15th. We've pinged Browns to get it replenished."
  - "- Lunds & Byerlys Woodbury: fully stocked, and Ken Davis has been discontinued here — worth watching for shelf space."
  - "- Cub West St Paul and Kowalski's Eden Prairie: routine check-ins, nothing to flag."
- Group stores together ONLY when they genuinely share the same observation (e.g., "Kowalski's Woodbury, White Bear, and Shoreview: all fully stocked."). Don't group just to be terse.
- If there are stores with no meaningful note, roll them into a single bullet like "- Routine check-ins also at [Store A] and [Store B]." Don't invent observations to fill space.
- Surface scorecard notes and distributor/buyer comments naturally inside this section when they're tied to a store or retailer. Standalone notes (e.g., "Browns said no promo calendar for H2") can live as their own bullet.

CLOSING
- End with one short, grounded sentence. If there's a concrete next step in the data, name it: "We'll be following up on the Eden Prairie replenishment."
- If there's no real next step, a simple factual closer is fine: "Otherwise a steady week across the market."
- Do NOT add a signature, team name, or "Best regards." The last sentence IS the end.

LENGTH
- Scale to activity. A quiet week with 3 visits and no changes should be a short paragraph or two. A rich week with 15+ visits, status changes, and buyer notes should be fuller — don't compress real signal.
- Never pad. If the data is thin, say so plainly and stop.

HARD RULES
- Never invent retailers, stores, products, prices, dates, buyer names, distributor names, or observations. If it isn't in the input data, it doesn't go in the recap.
- Never fabricate a follow-up or next step that isn't implied by the data.
- If the week has zero activity (no visits, no changes, no notes), write 1–2 honest sentences saying it was a quiet week and stop. Do not invent filler.
- Output Markdown only. No HTML. No code fences wrapping the response. Bold section headers are fine; do not use H1/H2 headings.

FORMATTING — CRITICAL
- Every bullet MUST be on its own line, starting with "- " at the beginning of the line.
- Put a blank line between the section header (e.g. **From the field**) and the first bullet.
- Put a blank line between paragraphs and between sections.
- Do NOT run bullets together on a single line with inline dashes like "- A - B - C". Each bullet gets its own line.

EXAMPLE OUTPUT — follow this structure exactly:

15 store visits across the Twin Cities this week, with a few things worth calling out.

**From the field**

- Jerry's Woodbury: fully stocked, and Royal Foods distribution is confirmed.
- Kowalski's Shoreview: shelves full — sauce holding at $6.29, honey at $13.99.
- Lunds & Byerlys Eden Prairie: inventory running low after the $4.99 sale wrapped on the 15th. We've pinged Browns to get it replenished.

We'll be following up on the Eden Prairie replenishment.`;

function formatDataForPrompt(data: BrandWeekData): string {
  const lines: string[] = [];
  lines.push(`Brand: ${data.brandName}`);
  lines.push(`Week: ${data.weekOf} through ${data.weekEnd}`);
  lines.push('');

  lines.push(`Market visits (${data.visits.length}):`);
  if (data.visits.length === 0) {
    lines.push('  (none)');
  } else {
    for (const v of data.visits) {
      const head = `  - ${v.date} — ${v.store}${v.address ? ` (${v.address})` : ''}`;
      lines.push(head);
      if (v.note) lines.push(`      rep note: ${v.note}`);
      for (const c of v.storeComments) {
        lines.push(`      comment by ${c.author}: ${c.text}`);
      }
    }
  }
  lines.push('');

  lines.push(`Status changes (${data.statusChanges.length}):`);
  if (data.statusChanges.length === 0) {
    lines.push('  (none)');
  } else {
    for (const s of data.statusChanges) {
      lines.push(`  - ${s.retailer} → ${s.product}: "${s.from || 'empty'}" → "${s.to || 'empty'}"`);
    }
  }
  lines.push('');

  lines.push(`Scorecard notes added this week (${data.scorecardNotes.length}):`);
  if (data.scorecardNotes.length === 0) {
    lines.push('  (none)');
  } else {
    for (const n of data.scorecardNotes) {
      lines.push(`  - ${n.retailer} — ${n.author}: ${n.text}`);
    }
  }
  lines.push('');
  lines.push('Please write the weekly update per the system instructions.');
  return lines.join('\n');
}

// Retryable upstream Gemini errors (transient capacity / rate limit issues).
function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /"code":\s*(429|500|503)|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(msg);
}

function friendlyGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (/"code":\s*503|UNAVAILABLE|high demand|overloaded/i.test(raw)) {
    return new Error('The AI model is temporarily overloaded. Please try again in a minute.');
  }
  if (/"code":\s*429|RESOURCE_EXHAUSTED/i.test(raw)) {
    return new Error('Rate limit hit on the AI model. Please wait a moment and try again.');
  }
  if (/"code":\s*401|PERMISSION_DENIED|API key/i.test(raw)) {
    return new Error('AI model authentication failed. Check GEMINI_API_KEY.');
  }
  return err instanceof Error ? err : new Error(raw || 'AI model request failed');
}

export async function generateWeeklySummary(data: BrandWeekData): Promise<{ summary: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const client = new GoogleGenAI({ apiKey });
  const userContent = formatDataForPrompt(data);

  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: userContent,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: 2000,
          temperature: 0.7,
        },
      });

      const text = (response.text || '').trim();
      if (!text) throw new Error('Gemini returned empty summary');
      return { summary: normalizeMarkdown(text), model: MODEL };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientGeminiError(err)) {
        const backoffMs = 800 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 400);
        logger.warn(`[weekly-summary] Gemini transient error (attempt ${attempt}/${maxAttempts}), retrying in ${backoffMs}ms`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw friendlyGeminiError(err);
    }
  }
  throw friendlyGeminiError(lastErr);
}

// Gemini occasionally collapses bullet lists onto one line with inline " - "
// separators. This splits those back into proper one-per-line bullets so the
// portal renderer displays them as a list.
function normalizeMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    // Case 1: "**Header** - item - item" → header on its own line, then bullets.
    const headerInline = line.match(/^(\*\*[^*]+\*\*)\s+-\s+(.*)$/);
    if (headerInline) {
      out.push(headerInline[1]);
      out.push('');
      for (const b of splitInlineBullets(headerInline[2])) out.push(`- ${b}`);
      continue;
    }
    // Case 2: "- A - B - C" on one line (no header) → split into separate bullets.
    if (/^-\s+.+\s-\s+/.test(line)) {
      const body = line.replace(/^-\s+/, '');
      for (const b of splitInlineBullets(body)) out.push(`- ${b}`);
      continue;
    }
    out.push(rawLine);
  }
  return out.join('\n');
}

// Split on " - " but only when the surrounding text looks like bullet boundaries
// (not part of a price range, phone number, or em-dash phrase).
function splitInlineBullets(s: string): string[] {
  return s
    .split(/\s+-\s+(?=[A-Z0-9])/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function persistWeeklySummary(
  data: BrandWeekData,
  summary: string,
  model: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('weekly_summaries')
    .upsert(
      {
        brand_name: data.brandName,
        week_of: data.weekOf,
        summary_md: summary,
        stats: data.stats,
        model,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_name,week_of' },
    );
  if (error) throw new Error(`Failed to persist summary: ${error.message}`);
}

export async function buildWeeklySummaryForBrand(brandName: string, weekOf: Date): Promise<{ data: BrandWeekData; summary: string }> {
  const data = await gatherBrandWeekData(brandName, weekOf);
  const { summary, model } = await generateWeeklySummary(data);
  await persistWeeklySummary(data, summary, model);
  logger.info(`[weekly-summary] generated for ${brandName} week of ${data.weekOf}`);
  return { data, summary };
}

export async function listActiveBrands(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('brand_user_profiles')
    .select('brand_name')
    .eq('is_active', true);
  const names = new Set<string>();
  for (const row of data || []) {
    if (row.brand_name) names.add(row.brand_name);
  }
  return Array.from(names);
}
