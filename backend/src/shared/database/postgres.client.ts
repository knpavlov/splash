import 'dotenv/config';
import { Pool, PoolConfig } from 'pg';

const buildPoolConfig = (): PoolConfig => {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return {
      connectionString,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false }
    };
  }

  const config: PoolConfig = {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  };

  if (process.env.NODE_ENV === 'production') {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
};

const pool = new Pool(buildPoolConfig());

pool.on('error', (error: Error) => {
  console.error('PostgreSQL connection pool reported an error:', error);
});

export const postgresPool = pool;
