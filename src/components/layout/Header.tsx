'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from './Logo';
import { AuthButtons } from '../auth/AuthButtons';
import { getMobileBrowserInfo } from '@/utils/mobileDetection';

interface HeaderProps {
  user: any;
  onAccountClick: () => void;
  onLogout: () => void;
}

export function Header({ user, onAccountClick, onLogout }: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const router = useRouter();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Detect Safari on mount
  useEffect(() => {
    const mobileInfo = getMobileBrowserInfo();
    if (mobileInfo?.isSafari) {
      setIsSafari(true);
      console.log('Safari detected in Header');
    }
  }, []);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleLoginClick = () => {
    closeMobileMenu();
    if (isSafari) {
      window.location.href = '/auth/login';
    } else {
      router.push('/auth/login');
    }
  };

  // Close mobile menu when clicking outside (Safari-safe)
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      try {
        if (
          mobileMenuRef.current &&
          !mobileMenuRef.current.contains(event.target as Node) &&
          menuButtonRef.current &&
          !menuButtonRef.current.contains(event.target as Node)
        ) {
          closeMobileMenu();
        }
      } catch (error) {
        console.error('Safari click outside error:', error);
        closeMobileMenu();
      }
    };

    // Use passive listeners for Safari
    const options = { passive: true };
    document.addEventListener('mousedown', handleClickOutside, options);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  // Close mobile menu on escape key (Safari-safe)
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      try {
        if (event.key === 'Escape') {
          closeMobileMenu();
        }
      } catch (error) {
        console.error('Safari escape key error:', error);
        closeMobileMenu();
      }
    };

    // Use passive listeners for Safari
    const options = { passive: true };
    document.addEventListener('keydown', handleEscapeKey, options);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="bg-white shadow sticky top-0 z-50">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <Logo />
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex gap-6 items-center">
            <Link href="#about" className="text-gray-700 hover:text-blue-600 font-medium transition">
              About
            </Link>
            <Link href="#clients" className="text-gray-700 hover:text-blue-600 font-medium transition">
              Our Clients
            </Link>
            <Link href="#contact" className="text-gray-700 hover:text-blue-600 font-medium transition">
              Contact
            </Link>
            <AuthButtons 
              user={user}
              onAccountClick={onAccountClick}
              onLogout={onLogout}
            />
          </div>

          {/* Mobile Menu Button */}
          <button
            ref={menuButtonRef}
            onClick={toggleMobileMenu}
            className="md:hidden p-2 rounded-md text-gray-700 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Toggle mobile menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation Menu */}
        <div 
          ref={mobileMenuRef}
          className={`md:hidden ${isMobileMenuOpen ? 'block' : 'hidden'} mt-4 pb-4 border-t border-gray-200`}
        >
          <div className="flex flex-col space-y-4 pt-4">
            <Link 
              href="#about" 
              className="text-gray-700 hover:text-blue-600 font-medium transition px-2 py-1"
              onClick={closeMobileMenu}
            >
              About
            </Link>
            <Link 
              href="#clients" 
              className="text-gray-700 hover:text-blue-600 font-medium transition px-2 py-1"
              onClick={closeMobileMenu}
            >
              Our Clients
            </Link>
            <Link 
              href="#contact" 
              className="text-gray-700 hover:text-blue-600 font-medium transition px-2 py-1"
              onClick={closeMobileMenu}
            >
              Contact
            </Link>
            <div className="pt-2 border-t border-gray-200">
              {!user ? (
                <button
                  onClick={handleLoginClick}
                  className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition shadow text-sm"
                >
                  Login
                </button>
              ) : (
                <AuthButtons 
                  user={user}
                  onAccountClick={() => {
                    closeMobileMenu();
                    onAccountClick();
                  }}
                  onLogout={() => {
                    closeMobileMenu();
                    onLogout();
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
} 