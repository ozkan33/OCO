'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8fafc] via-[#e0e7ef] to-[#e0e7ef] py-12 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
        <img
          src="https://i.hizliresim.com/rm69m47.png"
          alt="3 Brothers Marketing Logo"
          className="h-16 w-auto mb-4 cursor-pointer transition-transform hover:scale-105"
          onClick={() => window.location.href = '/'}
        />
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Sign In</h2>
        <p className="text-gray-500 mb-6 text-center">Welcome back! Please enter your credentials to access your dashboard.</p>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-center mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        <form
          className="w-full space-y-5"
          method="POST"
          action="/api/auth/login"
        >
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </span>
            <input
              type="text"
              name="username"
              placeholder="Username"
              required
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
            />
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 11c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm0 0v2m0 4h.01" /></svg>
            </span>
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition text-lg shadow"
          >
            Sign In
          </button>
        </form>
        <div className="flex items-center my-6 w-full">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="mx-4 text-gray-400">or</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>
        <button
          className="w-full py-3 border border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition text-lg shadow mb-2"
          onClick={() => window.location.href = '/auth/register'}
        >
          Sign Up
        </button>
        <button
          className="text-gray-600 hover:underline mt-2"
          onClick={() => window.location.href = '/'}
        >
          Back
        </button>
      </div>
    </div>
  );
} 