"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Inter, DM_Serif_Display } from 'next/font/google';
import { getMobileBrowserInfo } from '@/utils/mobileDetection';

const inter = Inter({ subsets: ['latin'] });
const dmSerif = DM_Serif_Display({ weight: '400', subsets: ['latin'], variable: '--font-display' });

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSafari, setIsSafari] = useState(false);
  const router = useRouter();
  const pathname = usePathname() || '';

  // Detect Safari on mount
  useEffect(() => {
    const mobileInfo = getMobileBrowserInfo();
    if (mobileInfo?.isSafari) {
      setIsSafari(true);
      console.log('Safari detected in ClientLayout');
    }
  }, []);

  useEffect(() => {
    // Fetch user info from /api/auth/me using cookies
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [pathname]); // Re-check auth when navigating between pages

  const handleAccountClick = () => {
    if (!user) return;
    
    const dest = user.role === 'ADMIN' ? '/admin/dashboard'
      : user.role === 'BRAND' ? '/portal'
      : '/vendor/dashboard';

    if (isSafari) {
      window.location.href = dest;
    } else {
      try { router.push(dest); }
      catch { window.location.href = dest; }
    }
  };

  const handleLogout = async () => {
    try {
      // Call logout endpoint to clear cookies
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      // Clear user state
      setUser(null);
      
      // Safari-specific navigation
      if (isSafari) {
        window.location.href = '/';
      } else {
        // Redirect to home with better mobile handling
        try {
          await router.push('/');
        } catch (routerError) {
          console.error('Router error, falling back to window.location:', routerError);
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback - still redirect to home
      if (isSafari) {
        window.location.href = '/';
      } else {
        try {
          await router.push('/');
        } catch (routerError) {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }
      }
    }
  };

  // Hide header on all /admin/*, /vendor/*, and /portal/* pages (they have their own headers)
  const isDashboard = pathname.startsWith('/admin') || pathname.startsWith('/vendor') || pathname.startsWith('/portal');

  return (
    <div className={`${inter.className} ${dmSerif.variable}`}>
      {!isDashboard && <Header user={user} loading={loading} onAccountClick={handleAccountClick} onLogout={handleLogout} />}
      <main className="min-h-screen">
        {children}
      </main>
    </div>
  );
} 