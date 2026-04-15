import Link from 'next/link';
import Image from 'next/image';

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-3 px-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="3 Brothers Marketing Logo" width={40} height={40} className="h-10 w-auto" />
            <span className="font-bold text-xl text-gray-800 tracking-tight">Vendor Portal</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/orders" className="text-gray-700 hover:text-blue-600 font-medium transition">Orders</Link>
            <Link href="/auth/logout" className="text-red-500 hover:text-red-700 font-medium transition">Logout</Link>
          </nav>
        </div>
      </header>
      <main className="min-h-screen bg-gray-50 pt-6">{children}</main>
    </div>
  );
}
