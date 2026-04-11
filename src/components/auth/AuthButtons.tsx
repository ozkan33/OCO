import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AuthButtonsProps {
  user: any;
  onAccountClick: () => void;
  onLogout: () => void;
}

export function AuthButtons({ user, onAccountClick, onLogout }: AuthButtonsProps) {
  const router = useRouter();

  if (!user) {
    return (
      <button
        onClick={() => router.push('/auth/login')}
        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition shadow text-sm w-full md:w-auto"
        style={{ minWidth: 90 }}
      >
        Login
      </button>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-2 md:gap-3 items-stretch md:items-center">
      {user.role === 'VENDOR' && (
        <Link 
          href="/vendor/dashboard" 
          className="text-gray-600 hover:text-gray-900 text-center md:text-left px-2 py-1 rounded hover:bg-gray-100 transition"
        >
          Vendor Dashboard
        </Link>
      )}
      <button 
        onClick={onAccountClick} 
        className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-gray-800 font-medium text-sm transition"
      >
        {user.name || user.username || (user.role === 'ADMIN' ? 'Admin' : 'Account')}
      </button>
      <button 
        onClick={onLogout} 
        className="px-3 py-2 bg-red-100 rounded hover:bg-red-200 text-red-800 font-medium text-sm transition"
      >
        Logout
      </button>
    </div>
  );
} 