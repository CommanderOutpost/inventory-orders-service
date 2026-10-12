import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { dataSourceOptions } from './data-source';
import { buildConfig } from './config/configuration';
import { User } from './database/entities/user.entity';
import { UserRole } from './users/user-role.enum';
import { Product } from './database/entities/product.entity';

const SAMPLE_PRODUCTS: Array<
  Pick<Product, 'name' | 'sku' | 'description' | 'price' | 'stock'>
> = [
  { name: 'Arabica Coffee Beans 1kg', sku: 'COF-ARB-1KG', description: 'Single origin Ethiopian beans, medium roast.', price: 18.5, stock: 120 },
  { name: 'Ceramic Coffee Mug 350ml', sku: 'MUG-CRM-350', description: 'Hand-glazed ceramic mug, dishwasher safe.', price: 12.0, stock: 80 },
  { name: 'Stainless Steel French Press', sku: 'PRE-FRN-750', description: '1L double-wall stainless steel press.', price: 34.99, stock: 45 },
  { name: 'Paper Filter Pack (100)', sku: 'FLT-PPR-100', description: 'V60 size 02 unbleached paper filters.', price: 6.5, stock: 200 },
  { name: 'Cold Brew Pitcher 1.5L', sku: 'CLD-BRW-15L', description: 'Boronate glass cold brew pitcher with mesh filter.', price: 27.0, stock: 30 },
  { name: 'Espresso Tamping Mat', sku: 'TMP-MAT-SML', description: 'Silicone tamping station, 28cm.', price: 14.75, stock: 60 },
  { name: 'Digital Kitchen Scale', sku: 'SCL-DGT-2KG', description: '0.1g precision scale for brew ratios.', price: 22.4, stock: 55 },
  { name: 'Gooseneck Kettle 900ml', sku: 'KTL-GSN-900', description: 'Precision pour-over kettle with thermometer.', price: 49.0, stock: 25 },
];

async function seed(): Promise<void> {
  const config = buildConfig();
  const dataSource = new DataSource(dataSourceOptions());
  await dataSource.initialize();

  try {
    const userRepository = dataSource.getRepository(User);
    const existingAdmin = await userRepository.findOne({
      where: { email: config.seedAdminEmail },
    });

    if (existingAdmin) {
      console.log(`Admin already exists: ${config.seedAdminEmail} (skipped)`);
    } else {
      const passwordHash = await bcrypt.hash(config.seedAdminPassword, 12);
      await userRepository.save(
        userRepository.create({
          email: config.seedAdminEmail,
          passwordHash,
          name: 'Administrator',
          role: UserRole.ADMIN,
        }),
      );
      console.log(
        `Admin created: ${config.seedAdminEmail} / ${config.seedAdminPassword}`,
      );
    }

    const productRepository = dataSource.getRepository(Product);
    const productCount = await productRepository.count();
    if (productCount > 0) {
      console.log(`${productCount} products already exist (skipped seeding)`);
    } else {
      await productRepository.save(
        SAMPLE_PRODUCTS.map((p) => productRepository.create(p)),
      );
      console.log(`Seeded ${SAMPLE_PRODUCTS.length} sample products`);
    }
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
