'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';
import { useState, useEffect } from 'react';

const services = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 19a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0z" />
      </svg>
    ),
    title: "Store Visits & Retail Audits",
    desc: "We get on the floor, verify shelf placement, check inventory, and fix execution gaps before they cost you velocity.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    title: "HQ Calls & Relationship Management",
    desc: "Direct buyer contact at the category level. We build and maintain the relationships that get your items reviewed, listed, and reordered.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Category Reviews & Positioning",
    desc: "We prepare data-driven presentations that show buyers exactly where your brand fills a gap and why it belongs on their shelf.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    title: "Promotion Planning & Execution Tracking",
    desc: "We plan, coordinate, and track VPPs, features, BOGOs, and ad events to maximize ROI and ensure nothing falls through the cracks.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
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

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setSending(true);
    // Opens the user's mail client with pre-filled content
    const subject = encodeURIComponent(`Message from ${form.name} via 3Brothers`);
    const body = encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`);
    window.location.href = `mailto:volkan@3brothersmarketing.com?subject=${subject}&body=${body}`;
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setForm({ name: '', email: '', message: '' });
    }, 800);
  }

  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      {/* Replace /public/hero.jpg with a grocery shelf / retail aisle photo.
          Search unsplash.com for: "grocery store aisle", "supermarket shelf products",
          "food retail display", "grocery store bokeh" — 1920×1080+, landscape. */}
      <section
        id="home"
        className="relative overflow-hidden text-white -mt-[72px]"
        style={{ minHeight: 'min(100svh, 740px)', paddingTop: '72px' }}
      >
        {/* Full-bleed background photo */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero.png')" }}
        />

        {/* Dark overlay for text legibility */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.50) 40%, rgba(15,23,42,0.55) 70%, rgba(15,23,42,0.80) 100%)',
          }}
        />

        {/* ── Content — centered ── */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-5 py-24 md:py-36 max-w-4xl mx-auto gap-6" style={{ minHeight: 'min(100svh, 740px)' }}>
          <span className="inline-block bg-blue-500/15 text-blue-200 text-xs font-semibold tracking-widest uppercase px-4 py-1.5 rounded-full border border-blue-400/30 backdrop-blur-sm">
            Minnesota · North Dakota · Wisconsin
          </span>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.08] tracking-tight" style={{ textShadow: '0 2px 24px rgba(0,0,0,0.6)' }}>
            From Shelf to&nbsp;Scale,<br />
            <span className="text-blue-400">We Grow Brands</span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-white/85 max-w-2xl leading-relaxed" style={{ textShadow: '0 1px 12px rgba(0,0,0,0.5)' }}>
            Strategic sales &amp; retail placement for food and beverage brands ready to win shelf space across the Upper Midwest.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full max-w-sm sm:max-w-none sm:justify-center">
            <button
              onClick={() => router.push('/auth/login')}
              className="px-8 py-3.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 active:scale-95 transition-all text-base shadow-lg shadow-blue-600/40"
            >
              Partner Portal
            </button>
            <a
              href="#contact"
              className="px-8 py-3.5 bg-white/15 text-white font-semibold rounded-lg hover:bg-white/25 active:scale-95 transition-all text-base border border-white/30 backdrop-blur-sm"
            >
              Get in Touch
            </a>
          </div>
        </div>

        {/* bottom fade into stats bar */}
        <div aria-hidden className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent z-10" />
      </section>

      {/* ── Territory bar ────────────────────────────────────────────────── */}
      <section className="relative bg-slate-50 border-b border-slate-200/60">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />
        <div className="max-w-5xl mx-auto px-5 py-10">
          <p className="text-center text-xs font-medium text-slate-400 uppercase tracking-wider mb-6">Our Territory &amp; Reach</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: "2,465", label: "Minnesota" },
              { value: "1,401", label: "Wisconsin" },
              { value: "163", label: "ND + SD" },
              { value: "4,029", label: "Total Doors" },
            ].map(s => (
              <div key={s.label}>
                <p className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
                  <span className="bg-gradient-to-b from-slate-900 to-slate-600 bg-clip-text text-transparent">{s.value}</span>
                </p>
                <p className="text-xs sm:text-sm font-medium text-slate-500 mt-2 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services ──────────────────────────────────────────────────────── */}
      <section id="about" className="bg-[#f8fafc] py-20 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0f172a]">What We Do</h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto text-base">
              We bridge the gap between emerging brands and the retailers that matter most.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {services.map(s => (
              <div
                key={s.title}
                className="bg-white rounded-2xl p-7 border border-slate-100 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-5 group-hover:bg-blue-200 transition-colors">
                  {s.icon}
                </div>
                <h3 className="text-lg font-bold text-[#0f172a] mb-2">{s.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-white">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0f172a] mb-5 leading-tight">
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
              { label: "Buyer Relationships", desc: "Direct buyer contact at the category level across MN, WI, ND & SD." },
              { label: "Execution Focused", desc: "Store visits, HQ calls, category reviews — we handle the ground game." },
              { label: "Built for Growth", desc: "We've helped brands expand from 20 doors to 200+ with sustainable velocity." },
            ].map(item => (
              <div key={item.label} className="bg-[#f8fafc] rounded-xl p-5 border border-slate-100">
                <p className="font-semibold text-[#0f172a] text-sm mb-1">{item.label}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Clients ───────────────────────────────────────────────────────── */}
      {clientLogos.length > 0 && (
      <section id="clients" className="py-20 px-5 bg-[#f8fafc]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0f172a]">Our Clients</h2>
            <p className="text-gray-500 mt-3 text-base">Proud partners across the Upper Midwest food & beverage space.</p>
          </div>
          <Swiper
            modules={[Autoplay]}
            spaceBetween={16}
            slidesPerView={2}
            breakpoints={{
              480:  { slidesPerView: 3, spaceBetween: 20 },
              768:  { slidesPerView: 4, spaceBetween: 24 },
              1024: { slidesPerView: 5, spaceBetween: 24 },
            }}
            loop={true}
            autoplay={{ delay: 1800, disableOnInteraction: false }}
          >
            {clientLogos.map((logo, idx) => (
              <SwiperSlide key={idx}>
                <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-gray-100 shadow-sm h-28 md:h-32 px-4 gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    className="max-h-12 md:max-h-14 max-w-full object-contain"
                  />
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-none text-center truncate w-full">{logo.alt}</span>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </section>
      )}

      {/* ── Contact ───────────────────────────────────────────────────────── */}
      <section id="contact" className="py-20 px-5 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0f172a]">Get in Touch</h2>
            <p className="text-gray-500 mt-3 text-base">
              Ready to grow? We&apos;d love to hear about your brand.
            </p>
          </div>

          {sent ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-10 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-green-800 mb-2">Message ready to send!</h3>
              <p className="text-green-700 text-sm mb-6">Your email client opened with the message pre-filled. Just hit send.</p>
              <button
                onClick={() => setSent(false)}
                className="px-6 py-2.5 bg-[#0f172a] text-white text-sm font-semibold rounded-lg hover:bg-[#1e293b] transition"
              >
                Send Another
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex flex-col gap-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Jane Smith"
                    required
                    className="border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="jane@yourbrand.com"
                    required
                    className="border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Message</label>
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell us about your brand and what you're looking for..."
                  required
                  rows={5}
                  className="border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={sending || !form.name || !form.email || !form.message}
                className="w-full py-3.5 bg-[#0f172a] text-white font-semibold rounded-lg hover:bg-[#1e293b] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {sending ? 'Opening email client…' : 'Send Message →'}
              </button>
              <p className="text-xs text-center text-gray-400">
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
      <footer className="bg-[#0f172a] text-slate-400 py-12 px-5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="3Brothers Logo"
              width={32}
              height={32}
              className="rounded"
            />
            <div>
              <p className="text-white font-bold text-sm">3Brothers Marketing</p>
              <p className="text-xs text-slate-500">MN · WI · ND · SD</p>
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <a href="#about"   className="hover:text-white transition">About</a>
            <a href="#clients" className="hover:text-white transition">Clients</a>
            <a href="#contact" className="hover:text-white transition">Contact</a>
            <Link href="/auth/login" className="hover:text-white transition">Portal Login</Link>
          </div>
          <p className="text-xs text-slate-600 text-center md:text-right">
            © {new Date().getFullYear()} 3Brothers Marketing. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  );
}
