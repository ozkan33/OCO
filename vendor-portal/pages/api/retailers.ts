// pages/api/vendors.ts
import prisma from '../../lib/prisma';
import bcrypt from 'bcrypt';


export default async function handler(req, res) {
  // Handle GET requests to fetch all vendors
  if (req.method === 'GET') {
    try {
      const vendors = await prisma.vendor.findMany();
      res.status(200).json(vendors);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch vendors' });
    }
  }

  // Handle POST requests to create a new vendor
  if (req.method === 'POST') {
    const { username, password, role, name } = req.body;
  
    if (!username || !password || !role || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
  
    try {
      // Hash the password before saving
      const hashedPassword = await bcrypt.hash(password, 10);
  
      const newVendor = await prisma.vendor.create({
        data: {
          username,
          password: hashedPassword,
          role,
          name,
        },
      });
  
      res.status(201).json(newVendor);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create vendor' });
    }
  }
}
