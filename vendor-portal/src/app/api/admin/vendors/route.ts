import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export async function GET(request: Request) {
  // Check for token in cookies
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenMatch = cookieHeader.match(/(?:^|; )token=([^;]*)/);
  const token = tokenMatch ? tokenMatch[1] : '';
  let decoded: any;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const vendors = await prisma.vendor.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        notes: {
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(vendors);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
  }
} 