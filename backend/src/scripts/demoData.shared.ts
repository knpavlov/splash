import { createHash } from 'crypto';

// Вспомогательная функция для генерации детерминированных UUID на основе строкового ключа
export const toUuid = (value: string): string => {
  const hash = createHash('sha256').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

export interface QueryableClient {
  query: <T = any>(query: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount?: number } & Record<string, unknown>>;
}

export interface DemoLogger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string, details?: unknown) => void;
}
