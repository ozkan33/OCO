'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminDataGrid from '@/components/admin/AdminDataGrid';

// Define types for Vendor and Note
interface Note {
  id: number;
  content: string;
  createdAt: string;
}

interface Vendor {
  id: number;
  name: string;
  username: string;
  notes: Note[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [noteInputs, setNoteInputs] = useState<Record<number, string>>({});
  const [successMsg, setSuccessMsg] = useState<string>('');
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

  useEffect(() => {
    // Fetch user info from /api/auth/me
    const checkAuthAndFetch = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          setUser(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!data.user || data.user.role !== 'ADMIN') {
          setUser(null);
          setLoading(false);
          return;
        }
        setUser(data.user);
        // Now fetch vendors
        const vres = await fetch('/api/admin/vendors', { credentials: 'include' });
        if (!vres.ok) throw new Error('Failed to fetch vendors');
        const vdata = await vres.json();
        setVendors(vdata);
      } catch (err: any) {
        setError(err.message || 'Error loading vendors');
      } finally {
        setLoading(false);
      }
    };
    checkAuthAndFetch();
  }, [router]);

  const handleNoteChange = (vendorId: number, value: string) => {
    setNoteInputs((prev) => ({ ...prev, [vendorId]: value }));
  };

  const handleAddNote = async (vendorId: number) => {
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: noteInputs[vendorId] }),
      });
      if (!res.ok) throw new Error('Failed to add note');
      setSuccessMsg('Note added!');
      setNoteInputs((prev) => ({ ...prev, [vendorId]: '' }));
      // Refresh vendors/notes
      const updated = await fetch('/api/admin/vendors', {
        credentials: 'include',
      });
      setVendors(await updated.json());
    } catch (err: any) {
      setError(err.message || 'Error adding note');
    }
  };

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