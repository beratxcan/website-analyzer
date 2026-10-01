import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAnalysisDto {
  @ApiProperty({ description: 'Id of the website to analyze' })
  @IsString()
  @IsNotEmpty()
  websiteId!: string;
}