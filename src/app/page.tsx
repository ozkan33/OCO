'use client';

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

const retailers: { name: string; url?: string }[] = [
  { name: 'Cub Foods', url: 'https://www.cub.com/' },
  { name: 'UNFI', url: 'https://www.unfi.com/' },
  { name: 'Festival Foods', url: 'https://www.festfoods.com/' },
  { name: 'Coborn\'s', url: 'https://coborns.com/' },
  { name: 'Lunds & Byerlys', url: 'https://www.lundsandbyerlys.com/' },
  { name: 'Lucky Seven', url: 'https://luckysevengeneralstores.com/' },
  { name: 'Von Hanson\'s', url: 'https://vonhansons.com/' },
  { name: 'Lipari', url: 'https://liparifoods.com/' },
  { name: 'SpartanNash', url: 'https://www.spartannash.com/' },
  { name: 'Fortune Fish', url: 'https://www.fortunefishco.net/' },
  { name: 'US Foods', url: 'https://www.usfoods.com/' },
  { name: 'Royal' },
  { name: 'Ronmar', url: 'https://www.ronmarfoods.com/' },
  { name: 'Bill\'s Superette', url: 'https://www.billssuperette.com/' },
  { name: 'Cash Wise', url: 'https://cashwise.com/' },
  { name: 'Fresh Thyme', url: 'https://ww2.freshthyme.com/' },
  { name: 'CPW', url: 'https://www.cpw.coop/' },
  { name: 'Brown\'s', url: 'https://brownsicecream.com/' },
  { name: 'Do It Best', url: 'https://www.doitbest.com/' },
  { name: 'Hugo\'s', url: 'https://www.gohugos.com/' },
  { name: 'Piggly Wiggly', url: 'https://www.shopthepig.com/' },
  { name: 'Woodman\'s', url: 'https://www.woodmans-food.com/' },
  { name: 'Kowalski\'s', url: 'https://www.kowalskis.com/' },
  { name: 'Knowlan\'s', url: 'https://www.knowlansfreshfoods.com/' },
  { name: 'Leevers Foods', url: 'https://www.leeversfoods.com/' },
  { name: 'Hornbacher\'s', url: 'https://hornbachers.com/' },
  { name: 'Jerry\'s', url: 'https://www.jerrysfoods.com/' },
  { name: 'Nilssen\'s', url: 'https://www.nilssensfoods.com/' },
  { name: 'Dick\'s Fresh Market', url: 'https://www.dicksfreshmarket.com/' },
  { name: 'Lueken\'s', url: 'https://www.luekens.com/' },
  { name: 'Lakewinds', url: 'https://www.lakewinds.coop/' },
  { name: 'Mackenthun\'s', url: 'https://mackenthuns.com/' },
  { name: 'Hy-Vee', url: 'https://www.hy-vee.com/' },
  { name: 'Seward Co-op', url: 'https://seward.coop/' },
  { name: 'Wedge', url: 'https://wedge.coop/' },
];

const faviconMap: Record<string, string> = {
  'www.cub.com': '/favicons/cub-com.png',
  'www.unfi.com': '/favicons/unfi-com.png',
  'www.festfoods.com': '/favicons/festfoods-com.png',
  'coborns.com': '/favicons/coborns-com.png',
  'www.lundsandbyerlys.com': '/favicons/lundsandbyerlys-com.png',
  'luckysevengeneralstores.com': '/favicons/luckysevengeneralstores-com.png',
  'vonhansons.com': '/favicons/vonhansons-com.png',
  'liparifoods.com': '/favicons/liparifoods-com.png',
  'www.spartannash.com': '/favicons/spartannash-com.png',
  'www.usfoods.com': '/favicons/usfoods-com.png',
  'www.ronmarfoods.com': '/favicons/ronmarfoods-com.png',
  'www.billssuperette.com': '/favicons/billssuperette-com.png',
  'cashwise.com': '/favicons/cashwise-com.png',
  'ww2.freshthyme.com': '/favicons/ww2-freshthyme-com.png',
  'www.cpw.coop': '/favicons/cpw-coop.png',
  'brownsicecream.com': '/favicons/brownsicecream-com.png',
  'www.doitbest.com': '/favicons/doitbest-com.png',
  'www.gohugos.com': '/favicons/gohugos-com.png',
  'www.shopthepig.com': '/favicons/shopthepig-com.png',
  'www.woodmans-food.com': '/favicons/woodmans-food-com.png',
  'www.kowalskis.com': '/favicons/kowalskis-com.png',
  'www.leeversfoods.com': '/favicons/leeversfoods-com.png',
  'hornbachers.com': '/favicons/hornbachers-com.png',
  'www.jerrysfoods.com': '/favicons/jerrysfoods-com.png',
  'www.nilssensfoods.com': '/favicons/nilssensfoods-com.png',
  'www.dicksfreshmarket.com': '/favicons/dicksfreshmarket-com.png',
  'www.luekens.com': '/favicons/luekens-com.png',
  'www.lakewinds.coop': '/favicons/lakewinds-coop.png',
  'mackenthuns.com': '/favicons/mackenthuns-com.png',
  'www.hy-vee.com': '/favicons/hy-vee-com.png',
  'seward.coop': '/favicons/seward-coop.png',
  'wedge.coop': '/favicons/wedge-coop.png',
  'www.fortunefishco.net': '',
  'www.knowlansfreshfoods.com': '',
};

function retailerFavicon(url?: string): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    return faviconMap[hostname] || null;
  } catch { return null; }
}

function getBrandUrl(label: string): string {
  return brandLinks[label] || brandLinks[label.trim()] || '';
}

export default function LandingPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', product: '', category: '', distribution: '', challenge: '', heardAbout: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [clientLogos, setClientLogos] = useState<{ src: string; alt: string }[]>([]);

  const handlePortalClick = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const role = data.user?.role;
        router.push(role === 'ADMIN' ? '/admin/dashboard' : '/portal');
        return;
      }
    } catch { /* not logged in */ }
    router.push('/auth/login');
  };

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.product || !form.category) return;
    setSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setSent(true);
      setForm({ name: '', email: '', product: '', category: '', distribution: '', challenge: '', heardAbout: '', message: '' });
    } catch {
      alert('Network error. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-white">

      {/* JSON-LD Structured Data for SEO — multiple schemas for rich results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([
          // 1. Organization + LocalBusiness (dual-type for max coverage)
          {
            '@context': 'https://schema.org',
            '@type': ['Organization', 'LocalBusiness'],
            '@id': 'https://3brothersmarketing.com/#organization',
            name: '3Brothers Marketing',
            alternateName: '3 Brothers Marketing',
            url: 'https://3brothersmarketing.com',
            logo: {
              '@type': 'ImageObject',
              url: 'https://3brothersmarketing.com/logo.png',
              width: 512,
              height: 512,
            },
            image: 'https://3brothersmarketing.com/logo.png',
            description: 'Boutique CPG sales brokerage helping emerging food & beverage brands win shelf space across 5,400+ retail doors in the Upper Midwest. Retail execution, buyer relationships, and category management.',
            foundingDate: '2024-08',
            numberOfEmployees: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 10 },
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'Minneapolis',
              addressRegion: 'MN',
              addressCountry: 'US',
            },
            geo: {
              '@type': 'GeoCoordinates',
              latitude: 44.9778,
              longitude: -93.2650,
            },
            areaServed: [
              { '@type': 'State', name: 'Minnesota', sameAs: 'https://en.wikipedia.org/wiki/Minnesota' },
              { '@type': 'State', name: 'Wisconsin', sameAs: 'https://en.wikipedia.org/wiki/Wisconsin' },
              { '@type': 'State', name: 'Michigan', sameAs: 'https://en.wikipedia.org/wiki/Michigan' },
              { '@type': 'State', name: 'North Dakota', sameAs: 'https://en.wikipedia.org/wiki/North_Dakota' },
              { '@type': 'State', name: 'South Dakota', sameAs: 'https://en.wikipedia.org/wiki/South_Dakota' },
            ],
            sameAs: [
              'https://www.instagram.com/3brothersmarketingmn/',
              'https://www.linkedin.com/company/3brothersmarketing',
            ],
            contactPoint: [
              {
                '@type': 'ContactPoint',
                email: 'volkan@3brothersmarketing.com',
                contactType: 'sales',
                areaServed: 'US',
                availableLanguage: 'English',
              },
            ],
            knowsAbout: [
              'CPG sales', 'food brokerage', 'retail execution', 'category management',
              'beverage distribution', 'shelf space management', 'grocery retail',
              'natural food distribution', 'emerging brand strategy',
            ],
            priceRange: '$$',
          },
          // 2. WebSite schema (enables sitelinks search box in Google)
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': 'https://3brothersmarketing.com/#website',
            url: 'https://3brothersmarketing.com',
            name: '3Brothers Marketing',
            description: 'CPG sales brokerage for emerging food & beverage brands in the Upper Midwest',
            publisher: { '@id': 'https://3brothersmarketing.com/#organization' },
            inLanguage: 'en-US',
          },
          // 3. WebPage schema
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': 'https://3brothersmarketing.com/#webpage',
            url: 'https://3brothersmarketing.com',
            name: '3Brothers Marketing | CPG Sales Brokerage — Midwest Food & Beverage',
            description: 'Boutique CPG sales brokerage helping emerging food & beverage brands win shelf space across 5,400+ retail doors in MN, WI, MI, ND & SD.',
            isPartOf: { '@id': 'https://3brothersmarketing.com/#website' },
            about: { '@id': 'https://3brothersmarketing.com/#organization' },
            inLanguage: 'en-US',
            primaryImageOfPage: {
              '@type': 'ImageObject',
              url: 'https://3brothersmarketing.com/logo.png',
            },
          },
          // 4. BreadcrumbList
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://3brothersmarketing.com' },
            ],
          },
          // 5. Service schema — concrete service offerings for rich results
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            '@id': 'https://3brothersmarketing.com/#service-brokerage',
            name: 'CPG Sales Brokerage',
            description: 'Full-service CPG sales representation including retail buyer introductions, shelf placement, and ongoing account management across the Upper Midwest.',
            provider: { '@id': 'https://3brothersmarketing.com/#organization' },
            serviceType: 'Sales Brokerage',
            areaServed: ['Minnesota', 'Wisconsin', 'Michigan', 'North Dakota', 'South Dakota'],
            hasOfferCatalog: {
              '@type': 'OfferCatalog',
              name: 'Brokerage Services',
              itemListElement: [
                { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Retail Buyer Introductions' } },
                { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Shelf Placement & Category Management' } },
                { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Store-Level Retail Audits' } },
                { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Distributor & Retailer Relationship Management' } },
              ],
            },
          },
          // 6. FAQPage schema — targets "People Also Ask" and FAQ rich results
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'What is a CPG sales broker?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'A CPG sales broker represents consumer packaged goods brands to retail buyers. They help brands get products onto store shelves by leveraging buyer relationships, managing presentations, and handling ongoing account management. 3Brothers Marketing specializes in food and beverage brands across the Upper Midwest.',
                },
              },
              {
                '@type': 'Question',
                name: 'What states does 3Brothers Marketing cover?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: '3Brothers Marketing operates across five Upper Midwest states: Minnesota, Wisconsin, Michigan, North Dakota, and South Dakota. We have relationships with over 5,400 retail doors across these markets.',
                },
              },
              {
                '@type': 'Question',
                name: 'How is 3Brothers Marketing different from large CPG brokers?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Unlike large brokers that carry hundreds of brands, 3Brothers Marketing keeps its roster intentionally small. This means every brand gets direct access to the founders, dedicated attention, and honest feedback rather than being one of hundreds competing for time within a massive portfolio.',
                },
              },
              {
                '@type': 'Question',
                name: 'What types of brands does 3Brothers Marketing work with?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'We specialize in emerging and growth-stage food and beverage brands including beverages, snacks, health and wellness products, supplements, frozen foods, dairy, and specialty grocery items. We have helped brands grow from 20 doors to over 200.',
                },
              },
              {
                '@type': 'Question',
                name: 'Do you provide real-time reporting on retail placements?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Yes. Every partner gets access to our live Partner Portal from day one. It includes a real-time scorecard showing product status across all retailers, store-level detail, market visit photos with proof of placement, and direct collaboration tools — no more waiting for monthly email reports.',
                },
              },
            ],
          },
        ]) }}
      />

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
          style={{ backgroundImage: "url('/hero.jpg')" }}
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
            Michigan · Minnesota · North Dakota · South Dakota · Wisconsin
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
              <p className="text-xs text-white/50">across MI, MN, ND, SD &amp; WI</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-3 w-full max-w-sm sm:max-w-none sm:justify-center">
            <a
              href="#contact"
              className="px-8 py-4 sm:py-3.5 min-h-[48px] inline-flex items-center justify-center bg-blue-500 text-white font-bold rounded-lg [@media(hover:hover)]:hover:bg-blue-600 active:bg-blue-600 active:scale-95 transition-all text-base shadow-lg shadow-blue-500/30"
            >
              Get in Touch
            </a>
            <button
              onClick={handlePortalClick}
              className="px-8 py-4 sm:py-3.5 min-h-[48px] inline-flex items-center justify-center bg-white/10 text-white font-semibold rounded-lg [@media(hover:hover)]:hover:bg-white/20 active:bg-white/20 active:scale-95 transition-all text-base border border-white/25 backdrop-blur-sm"
            >
              Partner Portal
            </button>
          </div>
        </div>

        {/* Bottom fade */}
        <div aria-hidden className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent z-10" />
      </section>

      {/* ── Client Logos Marquee (immediately after hero) ─────────────────── */}
      {clientLogos.length > 0 && (
        <section id="clients" className="bg-slate-50 py-6 border-b border-slate-200/60 overflow-hidden scroll-mt-20">
          <p className="text-center text-xs sm:text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4 sm:mb-5 px-4">Our Brand Partners</p>
          <div className="relative">
            <div className="flex items-center gap-8 logo-marquee" style={{ width: 'max-content' }}>
              {/* Double the logos for seamless loop */}
              {[...clientLogos, ...clientLogos].map((logo, idx) => {
                const url = getBrandUrl(logo.alt);
                const Wrapper = url ? 'a' : 'div';
                const linkProps = url ? { href: url, target: '_blank', rel: 'noopener noreferrer' } : {};
                return (
                  <Wrapper key={idx} {...linkProps} className={`flex-shrink-0 flex flex-col items-center justify-center gap-2 px-4 sm:px-5 py-2 opacity-80 [@media(hover:hover)]:hover:opacity-100 active:opacity-100 transition-opacity ${url ? 'cursor-pointer' : ''}`} title={url ? `Visit ${logo.alt}` : logo.alt}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.src} alt={logo.alt} className="max-h-14 sm:max-h-16 max-w-[120px] sm:max-w-[140px] object-contain" />
                    <span className="text-[13px] sm:text-sm font-semibold text-slate-600 uppercase tracking-wider leading-tight text-center whitespace-nowrap">{logo.alt}</span>
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
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Our Coverage</h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto text-base">
              Active across 5,438 retail doors in five Upper Midwest states.
            </p>
          </div>
          <TerritoryMap />
        </div>
      </section>

      {/* ── Retailers ─────────────────────────────────────────────────────── */}
      <section id="retailers" className="bg-slate-50 py-20 px-5 border-b border-slate-200/60">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
              Retailer and Distributor Partners
            </h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto text-base">
              From regional grocers to national distributors, our brands are on shelves where it matters.
            </p>
          </div>
          {/* Row 1 — scrolls left */}
          <div className="overflow-hidden retailer-marquee-track mb-3">
            <div className="flex items-center gap-3 retailer-marquee" style={{ width: 'max-content' }}>
              {[...retailers.slice(0, 18), ...retailers.slice(0, 18)].map((r, idx) => {
                const Wrapper = r.url ? 'a' : 'span';
                const linkProps = r.url ? { href: r.url, target: '_blank' as const, rel: 'noopener noreferrer' } : {};
                const domain = retailerFavicon(r.url);
                return (
                  <Wrapper
                    key={`r1-${idx}`}
                    {...linkProps}
                    className={`flex-shrink-0 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full border border-slate-200 bg-white text-base font-semibold text-slate-700 whitespace-nowrap transition-colors duration-200 ${r.url ? 'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 cursor-pointer' : ''}`}
                  >
                    {domain ? (
                      <img src={domain} alt="" className="w-7 h-7 rounded-sm flex-shrink-0" />
                    ) : (
                      <span className="w-5 h-5 rounded-sm bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0">{r.name[0]}</span>
                    )}
                    {r.name}
                  </Wrapper>
                );
              })}
            </div>
          </div>
          {/* Row 2 — scrolls right (reverse) */}
          <div className="overflow-hidden retailer-marquee-track">
            <div className="flex items-center gap-3 retailer-marquee-reverse" style={{ width: 'max-content' }}>
              {[...retailers.slice(18), ...retailers.slice(18)].map((r, idx) => {
                const Wrapper = r.url ? 'a' : 'span';
                const linkProps = r.url ? { href: r.url, target: '_blank' as const, rel: 'noopener noreferrer' } : {};
                const domain = retailerFavicon(r.url);
                return (
                  <Wrapper
                    key={`r2-${idx}`}
                    {...linkProps}
                    className={`flex-shrink-0 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full border border-slate-200 bg-white text-base font-semibold text-slate-700 whitespace-nowrap transition-colors duration-200 ${r.url ? 'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 cursor-pointer' : ''}`}
                  >
                    {domain ? (
                      <img src={domain} alt="" className="w-7 h-7 rounded-sm flex-shrink-0" />
                    ) : (
                      <span className="w-5 h-5 rounded-sm bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0">{r.name[0]}</span>
                    )}
                    {r.name}
                  </Wrapper>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Services ──────────────────────────────────────────────────────── */}
      <section className="bg-white py-20 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>What We Do</h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto text-base">
              Hands-on retail execution from headquarters to the shelf — we handle the work that moves product.
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
              <h3 className="text-xl font-bold text-blue-800 mb-2">Message sent!</h3>
              <p className="text-blue-700 text-sm mb-6">We&apos;ll get back to you shortly.</p>
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
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8 flex flex-col gap-5"
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

              {/* Row 4: How did you hear about us? */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">
                  How did you hear about us?
                  <span className="text-slate-400 font-normal ml-1.5">Optional</span>
                </label>
                <select
                  name="heardAbout"
                  value={form.heardAbout}
                  onChange={handleChange}
                  className="border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="">Select one</option>
                  <option value="Referral / Word of mouth">Referral / Word of mouth</option>
                  <option value="Google search">Google search</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Trade show / Event">Trade show / Event</option>
                  <option value="Industry publication">Industry publication</option>
                  <option value="Social media">Social media</option>
                  <option value="Existing client">Existing client</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Row 5: Optional notes */}
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
                className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {sending ? 'Sending...' : 'Send Message'}
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 uppercase tracking-wider">Or reach us</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <a
                  href="mailto:volkan@3brothersmarketing.com"
                  className="inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-blue-500 hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-all"
                >
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-medium">Email</span>
                </a>
                <a
                  href="https://www.instagram.com/3brothersmarketingmn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow us on Instagram"
                  className="group inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-transparent hover:bg-gradient-to-br hover:from-purple-500 hover:via-pink-500 hover:to-amber-400 text-slate-700 hover:text-white transition-all"
                >
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  <span className="text-sm font-medium">Instagram</span>
                </a>
                <a
                  href="https://www.linkedin.com/company/3brothersmarketing"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow us on LinkedIn"
                  className="group inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-transparent hover:bg-[#0A66C2] text-slate-700 hover:text-white transition-all"
                >
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                  <span className="text-sm font-medium">LinkedIn</span>
                </a>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 pt-16 pb-8 px-5">
        <div className="max-w-6xl mx-auto flex flex-col gap-12">
          {/* Main columns */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
            {/* Brand / About */}
            <div className="md:col-span-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="3Brothers Logo"
                  width={44}
                  height={44}
                  className="rounded-lg"
                />
                <div>
                  <p className="text-white font-bold text-base">3Brothers Marketing</p>
                  <p className="text-xs text-slate-500 mt-0.5">MN · WI · MI · ND · SD</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Minneapolis, MN</span>
              </div>
            </div>

            {/* Quick Links */}
            <div className="md:col-span-3 flex flex-col gap-4">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Explore</h3>
              <ul className="flex flex-col gap-2.5 text-sm">
                <li>
                  <a href="#retailers" className="text-slate-400 hover:text-white transition-colors inline-flex items-center gap-2 group">
                    <span className="w-1 h-1 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors" />
                    Retailers
                  </a>
                </li>
                <li>
                  <a href="#clients" className="text-slate-400 hover:text-white transition-colors inline-flex items-center gap-2 group">
                    <span className="w-1 h-1 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors" />
                    Clients
                  </a>
                </li>
                <li>
                  <a href="#contact" className="text-slate-400 hover:text-white transition-colors inline-flex items-center gap-2 group">
                    <span className="w-1 h-1 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors" />
                    Contact
                  </a>
                </li>
                <li>
                  <button onClick={handlePortalClick} className="text-slate-400 hover:text-white transition-colors inline-flex items-center gap-2 group">
                    <span className="w-1 h-1 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors" />
                    Portal Login
                  </button>
                </li>
              </ul>
            </div>

            {/* Connect */}
            <div className="md:col-span-4 flex flex-col gap-4">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Connect</h3>

              {/* Direct email CTA */}
              <a
                href="mailto:volkan@3brothersmarketing.com"
                className="group flex items-start gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-800 hover:border-blue-500/60 hover:bg-slate-800 transition-all"
              >
                <div className="flex-none w-9 h-9 rounded-md bg-slate-900 flex items-center justify-center group-hover:bg-blue-500/10 transition-colors">
                  <svg className="w-[18px] h-[18px] text-slate-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Email us</p>
                  <p className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                    volkan@3brothersmarketing.com
                  </p>
                </div>
              </a>

              {/* Social */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {/* Instagram */}
                  <a
                    href="https://www.instagram.com/3brothersmarketingmn/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Follow us on Instagram"
                    className="group inline-flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg bg-slate-800/60 border border-slate-800 hover:border-transparent hover:bg-gradient-to-br hover:from-purple-500 hover:via-pink-500 hover:to-amber-400 transition-all duration-200"
                  >
                    <svg className="w-[18px] h-[18px] text-slate-400 group-hover:text-white transition-colors duration-200" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                    </svg>
                    <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors duration-200">Instagram</span>
                  </a>
                  {/* LinkedIn */}
                  <a
                    href="https://www.linkedin.com/company/3brothersmarketing"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Follow us on LinkedIn"
                    className="group inline-flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg bg-slate-800/60 border border-slate-800 hover:border-transparent hover:bg-[#0A66C2] transition-all duration-200"
                  >
                    <svg className="w-[18px] h-[18px] text-slate-400 group-hover:text-white transition-colors duration-200" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                    <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors duration-200">LinkedIn</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-800" />

          {/* Bottom bar */}
          <div className="flex items-center justify-center -mt-4">
            <p className="text-xs text-slate-500">
              &copy; {new Date().getFullYear()} 3Brothers Marketing. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
