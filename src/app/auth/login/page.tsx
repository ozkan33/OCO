'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { handleMobileRedirect, getMobileBrowserInfo } from '@/utils/mobileDetection';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const router = useRouter();

  // Detect Safari on mount
  useEffect(() => {
    const mobileInfo = getMobileBrowserInfo();
    if (mobileInfo?.isSafari) {
      setIsSafari(true);
      console.log('Safari detected, using Safari-specific handling');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      // Safari-safe environment variable access
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration is missing. Please check your environment variables.');
      }
      
      console.log('Using Supabase URL:', supabaseUrl);
      
      // Log mobile browser info for debugging
      const mobileInfo = getMobileBrowserInfo();
      if (mobileInfo?.isMobile) {
        console.log('Mobile browser detected:', mobileInfo);
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      setLoading(false);
      
      if (error) {
        console.error('Supabase auth error:', error);
        setError(`Login failed: ${error.message}`);
        return;
      }
      
      if (!data?.session) {
        setError('Login failed - no session returned');
        return;
      }
      
      console.log('Login successful, setting cookie-based session');
      
      // Send session to server to set HTTP-only cookies
      const response = await fetch('/api/auth/set-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user: data.user,
        }),
      });
      
      if (!response.ok) {
        console.error('Failed to set session cookie');
        setError('Authentication failed - please try again');
        return;
      }
      
      console.log('Session cookie set successfully');
      
      // Safari-specific navigation handling
      if (isSafari) {
        // Use window.location for Safari to avoid router issues
        window.location.href = '/admin/dashboard';
      } else {
        // Use router for other browsers
        try {
          await router.push('/admin/dashboard');
        } catch (routerError) {
          console.error('Router error, falling back to window.location:', routerError);
          window.location.href = '/admin/dashboard';
        }
      }
      
    } catch (fetchError: any) {
      console.error('Login error:', fetchError);
      setLoading(false);
      setError(`Error: ${fetchError.message || 'An unexpected error occurred'}`);
    }
  };

  const handleBackClick = () => {
    if (isSafari) {
      window.location.href = '/';
    } else {
      try {
        router.push('/');
      } catch (routerError) {
        console.error('Router error, falling back to window.location:', routerError);
        window.location.href = '/';
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8fafc] via-[#e0e7ef] to-[#e0e7ef] py-12 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
        <img
          src="https://i.hizliresim.com/rm69m47.png"
          alt="3 Brothers Marketing Logo"
          className="h-16 w-auto mb-4 cursor-pointer transition-transform hover:scale-105"
          onClick={handleBackClick}
        />
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Sign In</h2>
        <p className="text-gray-500 mb-6 text-center">Welcome back! Please enter your credentials to access your dashboard.</p>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-center mb-4 w-full" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        
        <form className="w-full space-y-5" onSubmit={handleLogin}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
            </span>
            <input
              type="email"
              name="email"
              placeholder="Email"
              required
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
            />
          </div>
          
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          
          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition text-lg shadow disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        
        <button
          className="text-gray-600 hover:underline mt-4"
          onClick={handleBackClick}
        >
          Back
        </button>
      </div>
    </div>
  );
} 