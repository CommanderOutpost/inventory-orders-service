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
  reportingToken: string;
  seedAdminEmail: string;
  seedAdminPassword: string;
}

const JWT_SECRET = Joi.string()
  .min(16)
  .required()
  .custom((value: string, helpers) => {
    if (/change-me|replace-me|changeme/i.test(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  })
  .messages({
    'any.invalid': 'JWT_SECRET must not be a placeholder value',
  });

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  JWT_SECRET: JWT_SECRET,
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),
  REPORTING_SERVICE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:8080'),
  REPORTING_TOKEN: Joi.string().allow('').default(''),
  SEED_ADMIN_EMAIL: Joi.string().email().default('admin@example.com'),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).default('Admin123!'),
});

/**
 * Builds the app config through the single Joi schema, so defaults (seed
 * credentials, ports, the reporting URL/token) are applied consistently for
 * every entry point — including scripts like `seed.ts` that run outside the
 * Nest DI container. This is the single source of truth for config: defaults
 * live in Joi only and cannot drift from what the app actually uses.
 */
export function buildConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const { value, error } = configValidationSchema.validate(env, {
    allowUnknown: true,
    stripUnknown: true,
  });

  if (error) {
    throw new Error(`Invalid environment configuration: ${error.message}`);
  }

  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    dbSynchronize: value.DB_SYNCHRONIZE,
    dbLogging: value.DB_LOGGING,
    jwtSecret: value.JWT_SECRET,
    jwtExpiresIn: value.JWT_EXPIRES_IN,
    corsOrigins: value.CORS_ORIGINS.split(',')
      .map((o: string) => o.trim())
      .filter(Boolean),
    reportingServiceUrl: value.REPORTING_SERVICE_URL,
    reportingToken: value.REPORTING_TOKEN,
    seedAdminEmail: value.SEED_ADMIN_EMAIL,
    seedAdminPassword: value.SEED_ADMIN_PASSWORD,
  };
}

export const configFactory = (): AppConfig => buildConfig();

export const CONFIG_KEY = 'app';