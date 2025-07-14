// lib/jwt.ts
import jwt from 'jsonwebtoken';

export function verifyJwt(token: string) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);  // Ensure the JWT_SECRET is in your .env file
    return decoded;  // The decoded token will contain user information (e.g., id, role)
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}
