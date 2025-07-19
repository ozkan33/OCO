'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminDataGrid from '@/components/admin/AdminDataGrid';
import { SafariErrorBoundary } from '@/components/ui/SafariErrorBoundary';

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      setLoadingUser(true);
      setError(null);
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          setUser(null);
          setError('Authentication failed');
          setLoadingUser(false);
          return;
        }
        const data = await res.json();
        setUser(data.user);
      } catch (err) {
        console.error('Failed to fetch user:', err);
        setUser(null);
        setError('Failed to load user data');
      }
      setLoadingUser(false);
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/';
    }
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative max-w-md" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user || !user.role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative max-w-md" role="alert">
          <strong className="font-bold">Unauthorized: </strong>
          <span className="block sm:inline">You do not have access to this page.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Dashboard Header */}
      <header className="bg-white shadow sticky top-0 z-50">
        <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/') }>
            <img src="https://i.hizliresim.com/rm69m47.png" alt="3BrothersMarketing Logo" width={36} height={36} />
            <span className="text-xl font-bold text-gray-800">3Brothers Marketing</span>
          </div>
          <button onClick={handleLogout} className="ml-2 px-3 py-1 bg-red-100 rounded hover:bg-red-200 text-red-800 font-medium">
            Logout
          </button>
        </nav>
      </header>
      {/* Full-width grid with sidebar */}
      <main className="w-full max-w-none px-0 py-12 flex justify-center">
        <div className="w-full">
          <SafariErrorBoundary>
            <AdminDataGrid userRole={user.role} key={user.role} />
          </SafariErrorBoundary>
        </div>
      </main>
    </div>
  );
}