import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { ComparisonService } from './comparison.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [QueueModule],
  controllers: [AnalysesController],
  providers: [AnalysesService, ComparisonService, ReportsService],
})
export class AnalysesModule {}
