// pages/api/retailers/[id]/orders.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../../lib/prisma';
import { verifyJwt } from '../../../../lib/jwt';
import { z } from 'zod';

// Zod schema for validating order creation body
const orderSchema = z.object({
  brandId: z.number(),
  unitQuantity: z.number().positive(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    query: { id }, // Retailer ID from the URL
    body,
  } = req;

  const retailerId = Number(id);

  if (req.method === 'POST') {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'Authentication required' });

      const decoded = await verifyJwt(token);
      if (!decoded || !decoded.id) {
        return res.status(403).json({ error: 'Invalid token' });
      }

      // Validate request body using Zod
      const parsed = orderSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }

      const { brandId, unitQuantity } = parsed.data;

      // Create order in DB
      const newOrder = await prisma.order.create({
        data: {
          vendorId: decoded.id,
          retailerId: retailerId,
          brandId: brandId,
          unitQuantity: unitQuantity,
          name: `Order-${Date.now()}`, // or body.name if user provides it
        },
      });
      

      res.status(201).json(newOrder);
    } catch (error) {
      res.status(500).json({ error: 'Error creating order' });
    }
  }

  else if (req.method === 'GET') {
    try {
      const orders = await prisma.order.findMany({
        where: { retailerId },
        include: {
          brand: true,
          vendor: true,
        },
      });
      res.status(200).json(orders);
    } catch (error) {
      res.status(500).json({ error: 'Error fetching orders' });
    }
  }

  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
