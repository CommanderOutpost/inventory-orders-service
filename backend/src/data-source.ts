import 'reflect-metadata';
import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { parse } from 'pg-connection-string';
import { SnakeNamingStrategy } from './database/snake-naming.strategy';
import { buildConfig } from './config/configuration';

export function dataSourceOptions(env: NodeJS.ProcessEnv = process.env): DataSourceOptions {
  const config = buildConfig(env);
  const parsed = parse(config.databaseUrl);

  return {
    type: 'postgres',
    host: parsed.host ?? 'localhost',
    port: parsed.port ? Number(parsed.port) : 5432,
    username: parsed.user,
    password: parsed.password ?? undefined,
    database: parsed.database ?? 'inventory',
    entities: [__dirname + '/database/entities/*.entity.{ts,js}'],
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: config.dbSynchronize,
    logging: config.dbLogging,
  };
}

/**
 * Default DataSource used by the TypeORM CLI (`migration:generate`, `migration:revert`).
 * The `migrate.ts` script uses `dataSourceOptions` directly for runtime migrations.
 */
export default new DataSource(dataSourceOptions());
