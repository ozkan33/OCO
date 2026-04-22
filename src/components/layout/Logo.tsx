import Link from 'next/link';
import Image from 'next/image';

interface LogoProps {
  variant?: 'light' | 'dark';
}

/**
 * Logo mark — renders the original logo.png image at the given size.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="3Brothers Marketing"
      width={size}
      height={size}
      className={`rounded-lg flex-shrink-0 ${className}`}
    />
  );
}

export function Logo({ variant = 'dark' }: LogoProps) {
  const isLight = variant === 'light';

  return (
    <Link href="/" className="flex items-center gap-2 min-h-[44px]">
      <LogoMark size={32} />
      <div className="flex flex-col">
        <span className={`text-lg md:text-xl font-bold leading-tight transition-colors ${isLight ? 'text-white' : 'text-slate-800'}`}>3Brothers</span>
        <span className={`text-xs md:text-sm leading-tight hidden sm:block transition-colors ${isLight ? 'text-white/70' : 'text-slate-500'}`}>Marketing</span>
      </div>
    </Link>
  );
}
