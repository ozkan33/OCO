import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import * as bcrypt from 'bcrypt';

// Utility function to delete expired unverified vendors
async function deleteExpiredUnverifiedVendors() {
  const THIRTY_MINUTES = 30 * 60 * 1000;
  const now = new Date();
  const expiredTokens = await prisma.verificationToken.findMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - THIRTY_MINUTES) }
    },
    include: { vendor: true }
  });
  for (const token of expiredTokens) {
    if (!token.vendor.emailVerified) {
      await prisma.vendor.delete({ where: { id: token.vendorId } });
    }
    await prisma.verificationToken.delete({ where: { id: token.id } });
  }
}

export async function POST(request: Request) {
  try {
    await deleteExpiredUnverifiedVendors();
    const { username, password, name, email } = await request.json();
    if (!username || !password || !name || !email) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    // Check if username or email already exists
    const existing = await prisma.vendor.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      return NextResponse.json({ error: 'Username or email already exists' }, { status: 400 });
    }
    const hashed = await bcrypt.hash(password, 10);
    const vendor = await prisma.vendor.create({
      data: {
        username,
        password: hashed,
        name,
        email,
        emailVerified: false,
        role: 'user',
      },
    });
    // TODO: Send verification email (mock for now)
    console.log(`Send verification email to ${email} with token: MOCK_TOKEN`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
} 