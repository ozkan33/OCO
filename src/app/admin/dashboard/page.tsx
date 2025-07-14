'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminDataGrid from '@/components/admin/AdminDataGrid';

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      setLoadingUser(true);
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          setUser(null);
          setLoadingUser(false);
          return;
        }
        const data = await res.json();
        setUser(data.user);
      } catch {
        setUser(null);
      }
      setLoadingUser(false);
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  };

  if (loadingUser) {
    return null; // or a spinner
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
          <AdminDataGrid userRole={user.role} key={user.role} />
        </div>
      </main>
    </div>
  );
}