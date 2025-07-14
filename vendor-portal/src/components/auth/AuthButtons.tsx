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
        className="ml-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition shadow text-sm"
        style={{ minWidth: 90 }}
      >
        Login
      </button>
    );
  }

  return (
    <>
      {user.role === 'VENDOR' && (
        <Link href="/vendor/dashboard" className="text-gray-600 hover:text-gray-900">
          Vendor Dashboard
        </Link>
      )}
      <button 
        onClick={onAccountClick} 
        className="ml-4 px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-gray-800 font-medium"
      >
        {user.name || user.username || (user.role === 'ADMIN' ? 'Admin' : 'Account')}
      </button>
      <button 
        onClick={onLogout} 
        className="ml-2 px-3 py-1 bg-red-100 rounded hover:bg-red-200 text-red-800 font-medium"
      >
        Logout
      </button>
    </>
  );
} 