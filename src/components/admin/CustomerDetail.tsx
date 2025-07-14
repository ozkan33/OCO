import React, { useState, useEffect } from 'react';
// Only import from react-router-dom if not using Next.js
let useParams: any = () => ({});
let useNavigate: any = () => () => {};
try {
  // @ts-ignore
  ({ useParams, useNavigate } = require('react-router-dom'));
} catch {}

let useRouter: any = undefined;
try {
  // @ts-ignore
  useRouter = require('next/navigation').useRouter;
} catch {}

interface Customer {
  id: number;
  name: string;
  address?: string;
  notes?: string;
}

interface CustomerDetailProps {
  id?: string;
}

export default function CustomerDetail(props: CustomerDetailProps) {
  // Use id from props if provided, otherwise from useParams
  const params = useParams ? useParams() : {};
  const id = props.id || params.id;
  const router = useRouter ? useRouter() : undefined;
  const navigate = useNavigate ? useNavigate() : undefined;
  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem('retailers') || '[]');
    const found = data.find((c: Customer) => c.id === Number(id));
    setCustomer(found);
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (!customer) return;
    setCustomer({ ...customer, [e.target.name]: e.target.value });
  }

  function handleSave() {
    const data = JSON.parse(localStorage.getItem('retailers') || '[]');
    const updated = data.map((c: Customer) => c.id === customer?.id ? customer : c);
    localStorage.setItem('retailers', JSON.stringify(updated));
    if (props.id && router) {
      router.push('/');
    } else if (navigate) {
      navigate('/');
    }
  }

  function handleCancel() {
    if (props.id && router) {
      router.push('/');
    } else if (navigate) {
      navigate('/');
    }
  }

  if (!customer) return <div>Loading...</div>;

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Edit Customer</h2>
      <div className="mb-4">
        <label>Name</label>
        <input name="name" value={customer.name} onChange={handleChange} className="border p-2 w-full" />
      </div>
      <div className="mb-4">
        <label>Address</label>
        <input name="address" value={customer.address || ''} onChange={handleChange} className="border p-2 w-full" />
      </div>
      <div className="mb-4">
        <label>Notes</label>
        <textarea name="notes" value={customer.notes || ''} onChange={handleChange} className="border p-2 w-full" />
      </div>
      <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded">Save</button>
      <button onClick={handleCancel} className="ml-2 px-4 py-2 rounded border">Cancel</button>
    </div>
  );
} 