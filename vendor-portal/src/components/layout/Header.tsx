import Link from 'next/link';
import { Logo } from './Logo';
import { AuthButtons } from '../auth/AuthButtons';

interface HeaderProps {
  user: any;
  onAccountClick: () => void;
  onLogout: () => void;
}

export function Header({ user, onAccountClick, onLogout }: HeaderProps) {
  return (
    <header className="bg-white shadow sticky top-0 z-50">
      <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Logo />
        <div className="flex gap-6 items-center">
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
      </nav>
    </header>
  );
} 