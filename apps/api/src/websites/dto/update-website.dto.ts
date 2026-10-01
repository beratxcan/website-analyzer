import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { UpdateWebsiteRequest } from '@analyzer/contracts';

export class UpdateWebsiteDto implements UpdateWebsiteRequest {
  @ApiPropertyOptional({ example: 'Renamed site' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'https://example.org' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url?: string;
}