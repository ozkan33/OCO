'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import 'swiper/css';
import { useState, useEffect } from 'react';
import TerritoryMap from '@/components/ui/TerritoryMap';

const services = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 19a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0z" />
      </svg>
    ),
    title: "Store Visits & Retail Audits",
    desc: "We get on the floor, verify shelf placement, check inventory, and fix execution gaps before they cost you velocity.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    title: "HQ Calls & Relationship Management",
    desc: "Direct buyer contact at the category level. We build and maintain the relationships that get your items reviewed, listed, and reordered.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Category Reviews & Positioning",
    desc: "We prepare data-driven presentations that show buyers exactly where your brand fills a gap and why it belongs on their shelf.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    title: "Promotion Planning & Execution",
    desc: "We plan, coordinate, and track VPPs, features, BOGOs, and ad events to maximize ROI and ensure nothing falls through the cracks.",
  },
];

const brandLinks: Record<string, string> = {
  'Big Watt': 'https://bigwattbeverage.com',
  'Big Watt Beverage': 'https://bigwattbeverage.com',
  'Buon Giorno': 'https://buongiornousa.com',
  'Buon Giorno Italia': 'https://buongiornousa.com',
  'Cry Baby Craig\'s': 'https://crybabycraigs.com/',
  'Cry Baby Craigs': 'https://crybabycraigs.com/',
  'Davanni\'s': 'https://www.davannis.com/retail/',
  'Dino\'s': 'https://dinosfreshkitchen.com',
  'Dino\'s Hummus': 'https://dinosfreshkitchen.com',
  'Dinos': 'https://dinosfreshkitchen.com',
  'JoMomma\'s': 'https://www.jomommas.com',
  'JoMommas': 'https://www.jomommas.com',
  'Ken Davis': 'https://kendavisbbq.com',
  'KenDavis': 'https://kendavisbbq.com',
  'La Perla': 'https://www.tortillalaperla.com',
  'Nature Blessed': 'https://colomafrozen.com/shop/retail-products',
  'Natures Blessed': 'https://colomafrozen.com/shop/retail-products',
  'Northstar Kombucha': 'https://www.northstarkombucha.com',
  'Seven Bridges': 'https://sevenbridgessauces.com',
  'Skinny Sticks': 'https://www.skinnysticksmaplesyrup.com/store/c2/Maple_Syrup.html',
  'Smude': 'https://www.smudeoil.com',
  'Sturdiwheat': 'https://www.sturdiwheat.com',
  'Superior Water': 'https://www.superiormineralwater.com',
  'Sweet Martha\'s': 'https://www.sweetmarthas.com/frozen-dough',
  'Taco Terco': 'https://tacoterco.com/monterrey-pepper-sauce',
  'Mama Stoen\'s': '',
  'Coloma Frozen Foods': 'https://colomafrozen.com',
  'Calvin Cleo': '',
  'Calvin and Cleo': '',
};

function getBrandUrl(label: string): string {
  return brandLinks[label] || brandLinks[label.trim()] || '';
}

export default function LandingPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', product: '', category: '', distribution: '', challenge: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [clientLogos, setClientLogos] = useState<{ src: string; alt: string }[]>([]);

  useEffect(() => {
    fetch('/api/client-logos')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setClientLogos((data || []).map((l: any) => ({ src: l.image_url, alt: l.label })));
      })
      .catch(() => setClientLogos([]));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.product || !form.category) return;
    setSending(true);
    const subject = encodeURIComponent(`New Inquiry from ${form.name} — ${form.product}`);
    const lines = [
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      `Product / Brand: ${form.product}`,
      `Category: ${form.category}`,
      form.distribution ? `Current Distribution: ${form.distribution}` : '',
      form.challenge ? `Biggest Challenge: ${form.challenge}` : '',
      form.message ? `\nAdditional Notes:\n${form.message}` : '',
    ].filter(Boolean).join('\n');
    const body = encodeURIComponent(lines);
    window.location.href = `mailto:volkan@3brothersmarketing.com?subject=${subject}&body=${body}`;
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setForm({ name: '', email: '', product: '', category: '', distribution: '', challenge: '', message: '' });
    }, 800);
  }

  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section
        id="home"
        className="relative overflow-hidden text-white -mt-[72px]"
        style={{ minHeight: 'min(100svh, 780px)', paddingTop: '72px' }}
      >
        {/* Ken Burns animated background */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center hero-ken-burns"
          style={{ backgroundImage: "url('/hero.png')" }}
        />

        {/* Dark overlay */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.55) 50%, rgba(15,23,42,0.75) 100%)',
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-5 py-20 md:py-28 max-w-4xl mx-auto gap-5" style={{ minHeight: 'min(100svh, 780px)' }}>
          <span className="inline-block bg-blue-500/15 text-blue-200 text-xs font-semibold tracking-widest uppercase px-4 py-1.5 rounded-full border border-blue-400/30 backdrop-blur-sm">
            Minnesota · Wisconsin · Michigan · North Dakota · South Dakota
          </span>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight" style={{ fontFamily: 'var(--font-display)', textShadow: '0 2px 24px rgba(0,0,0,0.5)' }}>
            From Shelf to&nbsp;Scale,<br />
            <span className="text-blue-400">We Grow Brands</span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-white/80 max-w-2xl leading-relaxed" style={{ textShadow: '0 1px 12px rgba(0,0,0,0.4)' }}>
            Boutique CPG sales brokerage for food &amp; beverage brands ready to win shelf space across the Upper Midwest.
          </p>

          {/* Hero stat */}
          <div className="flex items-center gap-3 mt-2 bg-white/10 backdrop-blur-md rounded-xl px-6 py-3 border border-white/15">
            <span className="text-3xl sm:text-4xl font-extrabold text-blue-400 tracking-tight">5,438</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-white/90 leading-tight">Retail Doors</p>
              <p className="text-xs text-white/50">across MN, WI, MI, ND &amp; SD</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-3 w-full max-w-sm sm:max-w-none sm:justify-center">
            <button
              onClick={() => router.push('/auth/login')}
              className="px-8 py-3.5 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 active:scale-95 transition-all text-base shadow-lg shadow-blue-500/30"
            >
              Partner Portal
            </button>
            <a
              href="#contact"
              className="px-8 py-3.5 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 active:scale-95 transition-all text-base border border-white/25 backdrop-blur-sm"
            >
              Get in Touch
            </a>
          </div>
        </div>

        {/* Bottom fade */}
        <div aria-hidden className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent z-10" />
      </section>

      {/* ── Client Logos Marquee (immediately after hero) ─────────────────── */}
      {clientLogos.length > 0 && (
        <section className="bg-slate-50 py-6 border-b border-slate-200/60 overflow-hidden">
          <p className="text-center text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-4">Trusted by brands across the Upper Midwest</p>
          <div className="relative">
            <div className="flex items-center gap-8 logo-marquee" style={{ width: 'max-content' }}>
              {/* Double the logos for seamless loop */}
              {[...clientLogos, ...clientLogos].map((logo, idx) => {
                const url = getBrandUrl(logo.alt);
                const Wrapper = url ? 'a' : 'div';
                const linkProps = url ? { href: url, target: '_blank', rel: 'noopener noreferrer' } : {};
                return (
                  <Wrapper key={idx} {...linkProps} className={`flex-shrink-0 flex items-center justify-center h-12 px-4 opacity-60 hover:opacity-100 transition-opacity grayscale hover:grayscale-0 ${url ? 'cursor-pointer' : ''}`} title={url ? `Visit ${logo.alt}` : logo.alt}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.src} alt={logo.alt} className="max-h-10 max-w-[100px] object-contain" />
                  </Wrapper>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Territory Map ────────────────────────────────────────────────── */}
      <section className="relative bg-slate-50 border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <TerritoryMap />
        </div>
      </section>

      {/* ── Services ──────────────────────────────────────────────────────── */}
      <section id="about" className="bg-white py-20 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>What We Do</h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto text-base">
              We bridge the gap between emerging brands and the retailers that matter most.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {services.map(s => (
              <div
                key={s.title}
                className="rounded-2xl p-6 border border-slate-100 hover:border-blue-200 shadow-sm hover:shadow-md transition-all group bg-slate-50/50 hover:bg-white"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                  {s.icon}
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">{s.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-slate-50">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl text-slate-900 mb-5 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
              We care about brands<br />
              <span className="text-blue-600">that deserve the spotlight</span>
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              3 Brothers Marketing is a boutique CPG sales and strategy partner built for emerging brands. Founded in August 2024, we saw that small and mid-sized brands were being overlooked in massive portfolios at the largest distributors and brokerage agencies.
            </p>
            <p className="text-slate-600 leading-relaxed">
              We created 3 Brothers Marketing to give these brands the attention they deserve — with hands-on execution, tailored strategies, and deep Midwest retail expertise. Most brokers are built for volume. We are built for impact.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Boutique Attention", desc: "Your brand isn't lost in a 500-SKU portfolio. You get a dedicated partner." },
              { label: "Buyer Relationships", desc: "Direct buyer contact at the category level across MN, WI, MI, ND & SD." },
              { label: "Execution Focused", desc: "Store visits, HQ calls, category reviews — we handle the ground game." },
              { label: "Built for Growth", desc: "We've helped brands expand from 20 doors to 200+ with sustainable velocity." },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                <p className="font-semibold text-slate-900 text-sm mb-1">{item.label}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────────────────── */}
      <section id="contact" className="py-20 px-5 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Get in Touch</h2>
            <p className="text-slate-500 mt-3 text-base">
              Ready to grow? We&apos;d love to hear about your brand.
            </p>
          </div>

          {sent ? (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-10 text-center">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-blue-800 mb-2">Message ready to send!</h3>
              <p className="text-blue-700 text-sm mb-6">Your email client opened with the message pre-filled. Just hit send.</p>
              <button
                onClick={() => setSent(false)}
                className="px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition"
              >
                Send Another
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col gap-5"
            >
              {/* Row 1: Name + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Jane Smith"
                    required
                    className="border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="jane@yourbrand.com"
                    required
                    className="border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* Row 2: Product + Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">Product / Brand</label>
                  <input
                    type="text"
                    name="product"
                    value={form.product}
                    onChange={handleChange}
                    placeholder="e.g. Sunrise Energy Drink"
                    required
                    className="border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">Category</label>
                  <select
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    required
                    className="border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    <option value="" disabled>Select a category</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Health & Wellness">Health &amp; Wellness</option>
                    <option value="Personal Care">Personal Care</option>
                    <option value="Supplements">Supplements</option>
                    <option value="Frozen">Frozen</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Grocery / Pantry">Grocery / Pantry</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Distribution + Challenge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">Current Distribution</label>
                  <select
                    name="distribution"
                    value={form.distribution}
                    onChange={handleChange}
                    className="border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    <option value="">Select one (optional)</option>
                    <option value="No — not yet">No -- not yet</option>
                    <option value="Some — just started">Some -- just started</option>
                    <option value="Yes — already in retail">Yes -- already in retail</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">Biggest Challenge</label>
                  <select
                    name="challenge"
                    value={form.challenge}
                    onChange={handleChange}
                    className="border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    <option value="">Select one (optional)</option>
                    <option value="Getting into retail">Getting into retail</option>
                    <option value="Scaling distribution">Scaling distribution</option>
                    <option value="Marketing & brand awareness">Marketing &amp; brand awareness</option>
                    <option value="Pricing & margins">Pricing &amp; margins</option>
                    <option value="Supply chain / logistics">Supply chain / logistics</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Optional notes */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Anything else?
                  <span className="text-slate-400 font-normal ml-1.5">Optional</span>
                </label>
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell us anything else about your goals, timeline, or questions..."
                  rows={3}
                  className="border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={sending || !form.name || !form.email || !form.product || !form.category}
                className="w-full py-3.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {sending ? 'Opening email client...' : 'Send Message'}
              </button>
              <p className="text-xs text-center text-slate-400">
                Or{' '}
                <a href="mailto:volkan@3brothersmarketing.com" className="text-blue-600 hover:underline font-medium">
                  email us directly
                </a>
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="3Brothers Logo"
              width={32}
              height={32}
              className="rounded"
            />
            <div>
              <p className="text-white font-bold text-sm">3Brothers Marketing</p>
              <p className="text-xs text-slate-500">MN · WI · MI · ND · SD</p>
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <a href="#about" className="hover:text-white transition">About</a>
            <a href="#contact" className="hover:text-white transition">Contact</a>
            <Link href="/auth/login" className="hover:text-white transition">Portal Login</Link>
          </div>
          <p className="text-xs text-slate-600 text-center md:text-right">
            &copy; {new Date().getFullYear()} 3Brothers Marketing. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  );
}
