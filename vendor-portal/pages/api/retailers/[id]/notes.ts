// pages/api/retailers/[id]/notes.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../../lib/prisma';
import { verifyJwt } from '../../../../lib/jwt';
import { z } from 'zod';

// Zod schemas
const noteSchema = z.object({
  content: z.string().min(1, 'Note content cannot be empty'),
});

const updateSchema = z.object({
  noteId: z.number(),
  content: z.string().min(1, 'Note content cannot be empty'),
});

const deleteSchema = z.object({
  noteId: z.number(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    query: { id },
    method,
    body,
    headers,
  } = req;

  const retailerId = Number(id);
  if (isNaN(retailerId)) {
    return res.status(400).json({ error: 'Invalid retailer ID' });
  }

  // Authenticate Admin
  const token = headers.authorization?.split(' ')[1];
  const decoded = token ? verifyJwt(token) : null;

  if (['POST', 'PUT', 'DELETE'].includes(method || '') && (!decoded || decoded.role !== 'admin')) {
    return res.status(403).json({ error: 'Unauthorized: Admins only' });
  }

  try {
    if (method === 'GET') {
      const notes = await prisma.note.findMany({
        where: { retailerId },
        orderBy: { createdAt: 'desc' },
      });
      return res.status(200).json(notes);
    }

    if (method === 'POST') {
      const parsed = noteSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }

      const newNote = await prisma.note.create({
        data: {
          content: parsed.data.content,
          retailerId,
          vendorId: decoded.id,
        },
      });

      return res.status(201).json(newNote);
    }

    if (method === 'PUT') {
      const parsed = updateSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }

      const updatedNote = await prisma.note.update({
        where: { id: parsed.data.noteId },
        data: { content: parsed.data.content },
      });

      return res.status(200).json(updatedNote);
    }

    if (method === 'DELETE') {
      const parsed = deleteSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }

      await prisma.note.delete({
        where: { id: parsed.data.noteId },
      });

      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(`Error in ${method} /notes:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
