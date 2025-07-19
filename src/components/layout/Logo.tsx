import { useState } from 'react';
import Link from 'next/link';

export function Logo() {
  const [imgError, setImgError] = useState(false);
  
  return (
    <Link href="/" className="flex items-center gap-2">
      {imgError ? (
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
          <rect width="36" height="36" rx="8" fill="#2563eb"/>
          <text x="50%" y="55%" textAnchor="middle" fill="white" fontSize="16" fontFamily="Arial" dy=".3em">3B</text>
        </svg>
      ) : (
        <img 
          src="https://i.hizliresim.com/rm69m47.png" 
          alt="3Brothers Logo" 
          width={32} 
          height={32} 
          className="flex-shrink-0"
          onError={() => setImgError(true)} 
        />
      )}
      <div className="flex flex-col">
        <span className="text-lg md:text-xl font-bold text-gray-800 leading-tight">3Brothers</span>
        <span className="text-xs md:text-sm text-gray-600 leading-tight hidden sm:block">Marketing</span>
      </div>
    </Link>
  );
} 