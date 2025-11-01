declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string;
    ssl?: false | { rejectUnauthorized: boolean };
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
  }

  export interface QueryResult<R extends Record<string, unknown> = Record<string, unknown>> {
    rows: R[];
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<R extends Record<string, unknown> = Record<string, unknown>>(
      queryText: string,
      values?: unknown[]
    ): Promise<QueryResult<R>>;
    query<R extends Record<string, unknown> = Record<string, unknown>>(
      config: { text: string; values?: unknown[] }
    ): Promise<QueryResult<R>>;
    end(): Promise<void>;
    on(event: 'error', listener: (err: Error) => void): this;
  }
}
