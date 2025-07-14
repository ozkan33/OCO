"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const pathname = usePathname() || '';

  useEffect(() => {
    // Fetch user info from /api/auth/me to determine login state
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = await res.json();
        setUser(data.user);
      } catch {
        setUser(null);
      }
    };
    fetchUser();
  }, []);

  const handleAccountClick = () => {
    if (!user) return;
    if (user.role === 'ADMIN') {
      router.push('/admin/dashboard');
    } else if (user.role === 'VENDOR') {
      router.push('/vendor/dashboard');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  };

  // Hide header on all /admin/* and /vendor/* pages
  const isDashboard = pathname.startsWith('/admin') || pathname.startsWith('/vendor');

  return (
    <div className={inter.className}>
      {!isDashboard && (
        <Header
          user={user}
          onAccountClick={handleAccountClick}
          onLogout={handleLogout}
        />
      )}
      <main>{children}</main>
    </div>
  );
} 