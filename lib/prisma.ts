console.log('DATABASE_URL:', process.env.DATABASE_URL); // Add this

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;