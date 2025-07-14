import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create Vendors
  const vendor1 = await prisma.vendor.create({
    data: {
      username: 'vendor1',
      password: await bcrypt.hash('password123', 10),
      role: 'admin',
      name: 'Vendor One',
    },
  });

  const vendor2 = await prisma.vendor.create({
    data: {
      username: 'vendor2',
      password: await bcrypt.hash('password456', 10),
      role: 'user',
      name: 'Vendor Two',
    },
  });

  // Create Retailers
  const retailer1 = await prisma.retailer.create({
    data: {
      name: 'Retailer A',
      location: 'New York',
    },
  });

  const retailer2 = await prisma.retailer.create({
    data: {
      name: 'Retailer B',
      location: 'Los Angeles',
    },
  });

  // Create Brands
  const brand1 = await prisma.brand.create({
    data: {
      description: 'Brand Alpha',
      size: 'Large',
      pack: 'Box',
      upc: '1234567890',
      vendorId: vendor1.id,
    },
  });

  const brand2 = await prisma.brand.create({
    data: {
      description: 'Brand Beta',
      size: 'Medium',
      pack: 'Bag',
      upc: '0987654321',
      vendorId: vendor2.id,
    },
  });

  // Create Orders
  await prisma.order.create({
    data: {
      vendorId: vendor1.id,
      retailerId: retailer1.id,
      brandId: brand1.id,
      unitQuantity: 10,
      name: 'Order 1',
    },
  });

  await prisma.order.create({
    data: {
      vendorId: vendor2.id,
      retailerId: retailer2.id,
      brandId: brand2.id,
      unitQuantity: 20,
      name: 'Order 2',
    },
  });

  console.log('Seed data created!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
