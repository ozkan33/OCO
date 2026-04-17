'use client';

interface WeeklySummary {
  weekOf: string;
  markdown: string;
  stats: {
    visitCount?: number;
    storeCount?: number;
    statusChangeCount?: number;
    scorecardNoteCount?: number;
  };
  generatedAt: string;
}

function formatWeekRange(weekOf: string): string {
  const start = new Date(`${weekOf}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// Minimal markdown renderer: paragraphs, bold (**...**), and bullet lists.
// Safe because everything is rendered through React text nodes.
function renderMarkdown(md: string) {
  const blocks: Array<{ type: 'p' | 'ul' | 'h'; lines: string[] }> = [];
  const paragraphs = md.split(/\n{2,}/);
  for (const p of paragraphs) {
    const lines = p.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.every((l) => l.startsWith('- ') || l.startsWith('* '))) {
      blocks.push({ type: 'ul', lines: lines.map((l) => l.replace(/^[-*]\s+/, '')) });
    } else if (lines.length === 1 && /^\*\*.+\*\*$/.test(lines[0])) {
      blocks.push({ type: 'h', lines: [lines[0].replace(/^\*\*|\*\*$/g, '')] });
    } else {
      blocks.push({ type: 'p', lines });
    }
  }

  const renderInline = (text: string, key: number) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={key}>
        {parts.map((part, i) =>
          /^\*\*[^*]+\*\*$/.test(part) ? (
            <strong key={i} className="font-semibold text-slate-900">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </span>
    );
  };

  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">
      {blocks.map((block, i) => {
        if (block.type === 'h') {
          return (
            <h4 key={i} className="text-sm font-semibold text-slate-900 pt-1">
              {block.lines[0]}
            </h4>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1.5 marker:text-slate-400">
              {block.lines.map((line, j) => (
                <li key={j}>{renderInline(line, j)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {renderInline(line, j)}
                {j < block.lines.length - 1 ? ' ' : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export default function WeeklySummaryCard({ summary }: { summary: WeeklySummary | null }) {
  if (!summary) return null;
  const { visitCount = 0, storeCount = 0, statusChangeCount = 0 } = summary.stats;

  return (
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/40 shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-blue-100/80">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-blue-700 font-semibold">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Your week in review
          </div>
          <h3 className="text-lg font-bold text-slate-900 mt-0.5">{formatWeekRange(summary.weekOf)}</h3>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-center">
          <Stat value={visitCount} label={visitCount === 1 ? 'visit' : 'visits'} />
          <div className="h-8 w-px bg-blue-100" />
          <Stat value={storeCount} label={storeCount === 1 ? 'store' : 'stores'} />
          <div className="h-8 w-px bg-blue-100" />
          <Stat value={statusChangeCount} label="status updates" />
        </div>
      </div>
      <div className="px-5 py-5 sm:hidden flex items-center justify-around border-b border-blue-100/80">
        <Stat value={visitCount} label={visitCount === 1 ? 'visit' : 'visits'} />
        <Stat value={storeCount} label={storeCount === 1 ? 'store' : 'stores'} />
        <Stat value={statusChangeCount} label="status updates" />
      </div>
      <div className="px-5 py-5">{renderMarkdown(summary.markdown)}</div>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-slate-900 leading-none">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
    </div>
  );
}
