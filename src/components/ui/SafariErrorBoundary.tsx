'use client';

import React from 'react';
import { getMobileBrowserInfo } from '@/utils/mobileDetection';

interface SafariErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  isSafari: boolean;
}

interface SafariErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void; isSafari: boolean }>;
}

export class SafariErrorBoundary extends React.Component<SafariErrorBoundaryProps, SafariErrorBoundaryState> {
  constructor(props: SafariErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false, 
      isSafari: false 
    };
  }

  static getDerivedStateFromError(error: Error): SafariErrorBoundaryState {
    const mobileInfo = getMobileBrowserInfo();
    return { 
      hasError: true, 
      error, 
      isSafari: mobileInfo?.isSafari || false 
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const mobileInfo = getMobileBrowserInfo();
    const isSafari = mobileInfo?.isSafari || false;
    
    console.error('Safari Error Boundary caught an error:', error, errorInfo);
    console.error('Is Safari:', isSafari);
    console.error('User Agent:', navigator.userAgent);
    
    if (isSafari) {
      console.error('Safari-specific error detected');
      // Log Safari-specific debugging info
      if (typeof window !== 'undefined') {
        console.error('Viewport:', window.innerWidth, 'x', window.innerHeight);
        console.error('Screen:', screen.width, 'x', screen.height);
        console.error('Device Pixel Ratio:', window.devicePixelRatio);
      }
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent 
            error={this.state.error!} 
            resetError={this.resetError} 
            isSafari={this.state.isSafari} 
          />
        );
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-lg text-center">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {this.state.isSafari ? 'Safari Compatibility Issue' : 'Something went wrong'}
            </h2>
            <p className="text-gray-600 mb-4">
              {this.state.isSafari 
                ? 'We encountered a Safari-specific issue. This is a known compatibility problem with Safari on iOS.'
                : 'We encountered an error while loading this page.'
              }
            </p>
            <div className="space-y-2">
              <button
                onClick={this.resetError}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    // Use Safari-safe navigation
                    if (this.state.isSafari) {
                      window.location.replace('/');
                    } else {
                      window.location.href = '/';
                    }
                  }
                }}
                className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition"
              >
                Go Home
              </button>
              {this.state.isSafari && (
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      // Force a hard refresh for Safari
                      window.location.reload();
                    }
                  }}
                  className="w-full bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition"
                >
                  Refresh Page
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
} 