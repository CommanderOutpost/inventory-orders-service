import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source';

/**
 * Runs all pending migrations. Used both in local dev (`npm run migration:run`)
 * and in the production Docker image before the server starts.
 */
async function runMigrations(): Promise<void> {
  const dataSource = new DataSource(dataSourceOptions());
  await dataSource.initialize();
  try {
    const executed = await dataSource.runMigrations({ transaction: 'all' });
    console.log(
      `Migrations finished: ${executed.length} applied. Database is up to date.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
