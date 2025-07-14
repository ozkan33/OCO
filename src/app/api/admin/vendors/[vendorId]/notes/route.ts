import { NextResponse } from 'next/server';
import prisma from '../../../../../../../lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export async function POST(request: Request, { params }: { params: { vendorId: string } }) {
  // Authenticate admin using token from cookies
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenMatch = cookieHeader.match(/(?:^|; )token=([^;]*)/);
  const token = tokenMatch ? tokenMatch[1] : '';
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse request body
  let message = '';
  try {
    const body = await request.json();
    message = body.message;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  // Create note for vendor
  try {
    const vendorId = parseInt(params.vendorId, 10);
    const note = await prisma.note.create({
      data: {
        content: message,
        vendorId,
        retailerId: 1, // You may want to update this to associate with a real retailer
      },
    });
    return NextResponse.json(note);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
} 