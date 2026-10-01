import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { WebsitesController } from './websites.controller';
import { WebsitesService } from './websites.service';

@Module({
  imports: [ProjectsModule],
  controllers: [WebsitesController],
  providers: [WebsitesService],
})
export class WebsitesModule {}