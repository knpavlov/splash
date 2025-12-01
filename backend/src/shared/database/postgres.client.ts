import 'dotenv/config';
import { Pool, PoolConfig } from 'pg';

type EnsureConnectionOptions = {
  attempts?: number;
  baseDelayMs?: number;
  logger?: (message: string) => void;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildPoolConfig = (): PoolConfig => {
  const connectionTimeoutMs = Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 8000);
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    return {
      connectionString,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: connectionTimeoutMs
    } as PoolConfig;
  }

  const config: PoolConfig = {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  };
  (config as PoolConfig & { connectionTimeoutMillis?: number }).connectionTimeoutMillis = connectionTimeoutMs;

  if (process.env.NODE_ENV === 'production') {
    const missing = ['PGHOST', 'PGUSER', 'PGDATABASE'].filter((key) => !(process.env as Record<string, string | undefined>)[key]);
    if (missing.length) {
      throw new Error(
        `Database configuration is missing required env vars: ${missing.join(', ')}. Provide DATABASE_URL or PG* vars.`
      );
    }
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
};

const pool = new Pool(buildPoolConfig());

pool.on('error', (error: Error) => {
  console.error('PostgreSQL connection pool reported an error:', error);
});

export const postgresPool = pool;

// Многократно пытаемся подключиться к базе, чтобы пережить старт инфраструктуры на Railway
export const ensurePostgresConnection = async (options: EnsureConnectionOptions = {}) => {
  const {
    attempts = Number(process.env.DB_CONNECT_MAX_ATTEMPTS ?? 5),
    baseDelayMs = Number(process.env.DB_CONNECT_RETRY_DELAY_MS ?? 500),
    logger = console.warn
  } = options;

  const maxDelayMs = Number(process.env.DB_CONNECT_MAX_DELAY_MS ?? 5000);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('SELECT 1;');

      if (attempt > 1) {
        logger?.(`Соединение с PostgreSQL восстановлено после ${attempt} попыток.`);
      }

      return;
    } catch (error) {
      lastError = error;

      if (attempt >= attempts) {
        break;
      }

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      logger?.(
        `Не удалось подключиться к PostgreSQL (попытка ${attempt} из ${attempts}). ` +
          `Повторим через ${delay} мс.`
      );
      await wait(delay);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('Неизвестная ошибка подключения к PostgreSQL');
};
