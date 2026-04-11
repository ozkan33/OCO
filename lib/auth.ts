// lib/auth.ts
import jwt, { JwtPayload } from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export function verifyToken(req: any): JwtPayload {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }

    return decoded as JwtPayload; // now TypeScript knows it's an object
  } catch (err) {
    throw new Error('Invalid token');
  }
}
