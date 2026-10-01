import { Global, Module } from '@nestjs/common';
import { loadWorkerConfig } from '@analyzer/config';
import { APP_CONFIG } from './config.constants';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: loadWorkerConfig,
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}