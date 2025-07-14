"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname() || '';

  useEffect(() => {
    // Fetch user info from /api/auth/me using cookies
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me', { 
          credentials: 'include', // Include cookies in request
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
    try {
      // Call logout endpoint to clear cookies
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      // Clear user state
      setUser(null);
      
      // Redirect to home
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback - still redirect to home
      window.location.href = '/';
    }
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