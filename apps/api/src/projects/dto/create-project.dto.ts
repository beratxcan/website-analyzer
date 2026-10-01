import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateProjectRequest } from '@analyzer/contracts';

export class CreateProjectDto implements CreateProjectRequest {
  @ApiProperty({ example: 'My Website Project' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Optional description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}