import { useState } from 'react';
import Link from 'next/link';

export function Logo() {
  const [imgError, setImgError] = useState(false);
  
  return (
    <Link href="/" className="flex items-center gap-2">
      {imgError ? (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="36" height="36" rx="8" fill="#2563eb"/>
          <text x="50%" y="55%" textAnchor="middle" fill="white" fontSize="16" fontFamily="Arial" dy=".3em">3B</text>
        </svg>
      ) : (
        <img 
          src="https://i.hizliresim.com/rm69m47.png" 
          alt="3Brothers Logo" 
          width={36} 
          height={36} 
          onError={() => setImgError(true)} 
        />
      )}
      <span className="text-xl font-bold text-gray-800">3Brothers Marketing</span>
    </Link>
  );
} 