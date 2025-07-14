"use client";
import dynamic from 'next/dynamic';
import React from 'react';

const CustomerDetail = dynamic(() => import('../../../components/admin/CustomerDetail'), { ssr: false });

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  return <CustomerDetail id={params.id} />;
} 