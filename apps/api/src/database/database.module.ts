import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';

export const PG_POOL = Symbol('PG_POOL');

@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (config: AppConfig): Pool => {
        const pool = new Pool({
          connectionString: config.DATABASE_URL,
          max: 5,
          // Bound connection attempts so health checks and requests fail fast
          // instead of hanging while the database is unavailable.
          connectionTimeoutMillis: 2000,
        });
        // Idle clients emit 'error' without a listener, which would crash the
        // process; this is the documented no-op handler.
        pool.on('error', () => undefined);
        return pool;
      },
      inject: [APP_CONFIG],
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}