// lib/auth.ts
import jwt, { JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key';

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
