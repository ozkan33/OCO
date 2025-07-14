import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const vendors = await prisma.vendor.findMany();
  for (const vendor of vendors) {
    // Skip if already hashed (bcrypt hashes start with $2)
    if (vendor.password.startsWith('$2')) continue;

    const hashed = await bcrypt.hash(vendor.password, 10);
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { password: hashed },
    });
    console.log(`Updated vendor ${vendor.username} password to hashed.`);
  }
  console.log('All vendor passwords hashed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
