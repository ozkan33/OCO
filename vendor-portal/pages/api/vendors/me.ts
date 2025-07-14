// File: pages/api/vendors/me.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../.././lib/prisma';
import { verifyToken } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = verifyToken(req); // { id, username, role }

    const vendor = await prisma.vendor.findUnique({
      where: { id: user.id },
      include: {
        brands: true,
        orders: true,
      },
    });

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    res.status(200).json(vendor);
  } catch (err: any) {
    return res.status(401).json({ message: err.message || 'Unauthorized' });
  }
}
