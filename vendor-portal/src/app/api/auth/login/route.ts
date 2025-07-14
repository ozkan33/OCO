import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'; // Use a strong secret in production

function clientRedirect(url: string, token: string) {
  return new Response(
    `<html><head><meta http-equiv="refresh" content="0;url=${url}"></head><body><script>window.location.href='${url}'</script></body></html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Set-Cookie': `token=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    let username = '';
    let password = '';
    const contentType = request.headers.get('content-type') || '';
    const baseUrl = new URL(request.url).origin;
    if (contentType.includes('application/json')) {
      const body = await request.json();
      username = body.username;
      password = body.password;
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      username = formData.get('username')?.toString() || '';
      password = formData.get('password')?.toString() || '';
    }

    if (!username || !password) {
      return clientRedirect(`${baseUrl}/auth/login?error=Missing+username+or+password`, '');
    }

    // Test admin login
    if (username === 'admin' && password === 'admin123') {
      const token = jwt.sign({ id: 0, username: 'admin', role: 'ADMIN', name: 'Admin' }, JWT_SECRET, { expiresIn: '1d' });
      return clientRedirect(`${baseUrl}/admin/dashboard`, token);
    }

    // Test vendor login
    if (username === 'vendor' && password === 'vendor123') {
      const token = jwt.sign({ id: 1, username: 'vendor', role: 'VENDOR', name: 'Test Vendor' }, JWT_SECRET, { expiresIn: '1d' });
      return clientRedirect(`${baseUrl}/vendor/dashboard`, token);
    }

    // Find vendor by username
    const vendor = await prisma.vendor.findUnique({ where: { username } });
    if (!vendor) {
      return clientRedirect(`${baseUrl}/auth/login?error=Invalid+credentials`, '');
    }

    // Enforce email verification
    if (!vendor.emailVerified) {
      return clientRedirect(`${baseUrl}/auth/login?error=Please+verify+your+email+before+logging+in.`, '');
    }

    // Compare password
    const valid = await bcrypt.compare(password, vendor.password);
    if (!valid) {
      return clientRedirect(`${baseUrl}/auth/login?error=Invalid+credentials`, '');
    }

    // Create JWT
    const token = jwt.sign({ id: vendor.id, username: vendor.username, role: vendor.role, name: vendor.name }, JWT_SECRET, { expiresIn: '1d' });
    return clientRedirect(`${baseUrl}${vendor.role === 'ADMIN' ? '/admin/dashboard' : '/vendor/dashboard'}`, token);
  } catch (error) {
    const baseUrl = new URL(request.url).origin;
    return clientRedirect(`${baseUrl}/auth/login?error=Internal+server+error`, '');
  }
} 