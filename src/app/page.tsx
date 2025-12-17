'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { useEffect, useState } from 'react';
import jwt from 'jsonwebtoken';

const clientLogos = [
  { src: "https://i.hizliresim.com/4foaurk.jpg", alt: "Nature Blessed" },
  { src: "https://i.hizliresim.com/52p13eh.jpg", alt: "Cry Baby Craigs" },
  { src: "https://i.hizliresim.com/krii546.jpg", alt: "Buon Giorno Italia" },
  { src: "https://i.hizliresim.com/qfb79rk.png", alt: "Northstar Kombucha" },
  { src: "https://i.hizliresim.com/tvz3il4.png", alt: "Taco Terco" },
  { src: "https://i.hizliresim.com/h8v50a9.jpg", alt: "JoMama's" },
  { src: "https://i.hizliresim.com/d2zwezj.jpg", alt: "Sturdiwheat" },
  { src: "https://i.hizliresim.com/gj0kg4t.jpg", alt: "Big Watt Beverage" },
  { src: "https://i.hizliresim.com/krf2p1g.jpg", alt: "Seven Bridges" },
  { src: "https://i.hizliresim.com/m4yzvq2.jpg", alt: "KenDavis" },
  { src: "https://i.hizliresim.com/69suf7c.jpg", alt: "Dinos" },
  { src: "https://i.hizliresim.com/q3bhb2t.jpg", alt: "Coloma Frozen Foods" },
  { src: "https://i.hizliresim.com/69le7h5.jpg", alt: "Mama Stoen's" },
  { src: "https://i.hizliresim.com/88g01lk.jpg", alt: "Smude" },
  { src: "https://i.hizliresim.com/24tt7vi.jpeg", alt: "Superior Water" },
  { src: "https://i.hizliresim.com/mui2jgt.jpg", alt: "La Perla" },
  { src: "https://i.hizliresim.com/iv5mkd3.jpeg", alt: "Skinny Sticks" },
  { src: "https://i.hizliresim.com/61u7kde.jpeg", alt: "Calvin Cleo" }
];

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Hero Section */}
      <section id="home" className="flex flex-col items-center justify-center text-center py-12 md:py-20 px-4 bg-gradient-to-b from-white to-[#f8fafc]">
        <h1 className="text-3xl md:text-5xl font-extrabold text-[#1e293b] mb-2 cursor-pointer leading-tight" onClick={() => router.push('/')}>
          EMPOWERING GROWTH,<br className="hidden sm:block"/>ELEVATING BRANDS
        </h1>
        <p className="text-base md:text-xl text-gray-600 mb-6 md:mb-8 max-w-2xl mx-auto px-4">
          Strategic marketing solutions for brands ready to shine in Minnesota, North Dakota, and Wisconsin.
        </p>
        <button
          onClick={() => router.push('/auth/login')}
          className="px-6 md:px-8 py-3 bg-[#fbbf24] text-[#1e293b] font-semibold rounded shadow hover:bg-[#f59e0b] transition text-base md:text-lg w-full max-w-xs"
        >
          Get Started
        </button>
      </section>

      {/* About Section */}
      <section id="about" className="max-w-3xl mx-auto py-12 md:py-16 px-4">
        <h2 className="text-2xl md:text-3xl font-bold text-[#1e293b] mb-4 text-center md:text-left">About Us</h2>
        <div className="space-y-4">
          <p className="text-gray-700 text-base md:text-lg leading-relaxed">
            At 3 Brothers Marketing, our mission is to provide exceptional sales and account management services with a deep commitment to giving love and attention to the brands that often go unnoticed in the Minnesota, North Dakota, and Wisconsin markets. We strive to elevate these brands by building meaningful relationships with key retailers and distributors, ensuring their products receive the visibility and strategic placement they deserve.
          </p>
          <p className="text-gray-700 text-base md:text-lg leading-relaxed">
            Through customized strategies, thoughtful execution, and a focus on driving real growth, we bring passion and care to every partnership. Our approach is rooted in integrity, collaboration, and a genuine dedication to delivering sustainable success for brands that are ready to shine.
          </p>
        </div>
      </section>

      {/* Clients Section */}
      <section id="clients" className="max-w-5xl mx-auto py-12 md:py-16 px-4">
        <h2 className="text-2xl md:text-3xl font-bold text-[#1e293b] mb-6 md:mb-8 text-center">Our Clients</h2>
        <Swiper
          spaceBetween={20}
          slidesPerView={1}
          breakpoints={{
            480: { slidesPerView: 2, spaceBetween: 20 },
            640: { slidesPerView: 2, spaceBetween: 30 },
            768: { slidesPerView: 3, spaceBetween: 30 },
            1024: { slidesPerView: 3, spaceBetween: 30 },
            1280: { slidesPerView: 4, spaceBetween: 30 },
          }}
          loop={true}
          autoplay={{ delay: 2000, disableOnInteraction: false }}
          className="py-4 md:py-8"
        >
          {clientLogos.map((logo, idx) => (
            <SwiperSlide key={idx}>
              <div className="flex justify-center items-center p-4 md:p-8 bg-white rounded-lg shadow-md h-32 md:h-40 mx-2">
                <img src={logo.src} alt={logo.alt} className="max-h-full max-w-full object-contain" />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </section>

      {/* Contact Section */}
      <section id="contact" className="max-w-3xl mx-auto py-12 md:py-16 px-4">
        <h2 className="text-2xl md:text-3xl font-bold text-[#1e293b] mb-4 text-center md:text-left">Contact</h2>
        <form className="bg-white rounded-xl shadow-lg p-6 md:p-8 flex flex-col gap-4">
          <input 
            type="text" 
            placeholder="Your Name" 
            className="border border-gray-300 rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#fbbf24] text-base" 
          />
          <input 
            type="email" 
            placeholder="Your Email" 
            className="border border-gray-300 rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#fbbf24] text-base" 
          />
          <textarea 
            placeholder="Your Message" 
            className="border border-gray-300 rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#fbbf24] text-base resize-none" 
            rows={4}
          ></textarea>
          <button 
            type="submit" 
            className="px-6 py-3 bg-[#1e293b] text-white font-semibold rounded hover:bg-[#334155] transition text-base w-full md:w-auto"
          >
            Send Message
          </button>
        </form>
      </section>
    </div>
  );
} 