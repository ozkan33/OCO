// Shared parser for comment-text metadata emitted by the market-visit
// auto-comment flow (see /api/market-visits/route.ts). Comments from that flow
// follow the shape "[Market Visit — YYYY-MM-DD · <store>] <note>". The store
// segment is optional for backwards compatibility with notes created before the
// store suffix was added.

export interface CommentMeta {
  isMarketVisit: boolean;
  visitDate?: string;
  storeName?: string;
  body: string;
}

const MARKET_VISIT_PREFIX = /^\[Market Visit\s+[—-]\s*([^\]·]+?)(?:\s*·\s*([^\]]+?))?\]\s*/;

export function parseCommentMeta(text: string | null | undefined): CommentMeta {
  const raw = String(text ?? '');
  const match = raw.match(MARKET_VISIT_PREFIX);
  if (!match) return { isMarketVisit: false, body: raw };
  return {
    isMarketVisit: true,
    visitDate: match[1]?.trim() || undefined,
    storeName: match[2]?.trim() || undefined,
    body: raw.slice(match[0].length).trim(),
  };
}
