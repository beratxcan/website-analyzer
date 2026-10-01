import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { FindingsSort } from '@analyzer/contracts';

export class FindingsQueryDto {
  @IsOptional()
  @IsIn(['critical', 'high', 'medium', 'low', 'info'])
  severity?: string;

  @IsOptional()
  @IsIn(['seo', 'technical', 'content', 'accessibility', 'performance'])
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['severity', 'impact', 'code', 'newest'])
  sort?: FindingsSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}