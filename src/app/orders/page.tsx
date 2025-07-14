'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Order = {
  id: number;
  vendorId: number;
  retailerId: number;
  brandId: number;
  unitQuantity: number;
  vendor?: { name: string };
  retailer?: { name: string };
  brand?: { description: string };
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Get vendor name from localStorage (set after login)
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const parsed = JSON.parse(user);
        setVendorName(parsed.name || '');
      } catch {}
    }
    const fetchOrders = async () => {
      console.log('Fetching orders...');
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login...');
        router.push('/auth/login');
        return;
      }

      try {
        const response = await fetch('/api/orders', {
          credentials: 'include',
        });

        if (!response.ok) {
          if (response.status === 401) {
            console.log('Unauthorized, redirecting to login...');
            router.push('/auth/login');
            return;
          }
          throw new Error('Failed to fetch orders');
        }

        const data = await response.json();
        console.log('Orders fetched successfully:', data);
        setOrders(data);
      } catch (err: any) {
        console.error('Error fetching orders:', err);
        setError(err.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Loading Orders</h1>
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative max-w-md" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Orders</h1>
        {vendorName && (
          <span className="text-lg text-gray-700 font-semibold">Welcome, {vendorName}!</span>
        )}
      </div>
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Retailer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Brand</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No orders found
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.vendor?.name || order.vendorId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.retailer?.name || order.retailerId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.brand?.description || order.brandId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.unitQuantity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

