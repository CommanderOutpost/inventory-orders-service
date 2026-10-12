import * as Joi from 'joi';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  dbSynchronize: boolean;
  dbLogging: boolean;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  reportingServiceUrl: string;
  seedAdminEmail: string;
  seedAdminPassword: string;
}

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),
  REPORTING_SERVICE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:8080'),
  SEED_ADMIN_EMAIL: Joi.string().email().default('admin@example.com'),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).default('Admin123!'),
});

export function buildConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL as string,
    dbSynchronize: env.DB_SYNCHRONIZE === 'true',
    dbLogging: env.DB_LOGGING === 'true',
    jwtSecret: env.JWT_SECRET as string,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '1d',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    reportingServiceUrl: env.REPORTING_SERVICE_URL as string,
    seedAdminEmail: env.SEED_ADMIN_EMAIL as string,
    seedAdminPassword: env.SEED_ADMIN_PASSWORD as string,
  };
}

export const configFactory = (): AppConfig => buildConfig();

export const CONFIG_KEY = 'app';
