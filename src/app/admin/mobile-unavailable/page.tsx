import Link from 'next/link';

export const metadata = {
  title: 'OCO Admin requires a larger device',
};

/**
 * Landing page when a phone-class device tries to open /admin/*.
 * Middleware redirects here; this page does not itself enforce any gate.
 *
 * Styled with slate-* neutrals and inline SVG icons to match the admin
 * visual language. No emoji.
 */
export default function MobileUnavailablePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-10">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mx-auto mb-6">
          <svg
            className="w-7 h-7 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
            <path d="M10 18h4" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 text-center mb-3">
          OCO Admin requires a tablet or desktop
        </h1>

        <p className="text-sm text-slate-600 text-center leading-relaxed mb-6">
          The admin dashboard is dense and designed for iPad or larger screens.
          On a phone the grids do not fit and editing is unreliable. If you are
          a brand user, the portal is fully phone-ready.
        </p>

        <Link
          href="/portal"
          className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 text-white font-medium rounded-xl px-4 py-3 text-sm hover:bg-slate-800 active:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
        >
          Open the brand portal
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <p className="text-xs text-slate-400 text-center mt-6 leading-relaxed">
          Need to sign in as an admin right now? Open this link on an iPad or desktop,
          or append <span className="font-mono text-slate-500">?force=desktop</span> to
          the admin URL as an emergency override.
        </p>
      </div>
    </div>
  );
}
