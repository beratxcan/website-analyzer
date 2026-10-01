import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateWebsiteRequest } from '@analyzer/contracts';

export class CreateWebsiteDto implements CreateWebsiteRequest {
  @ApiProperty({ example: 'Example' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'https://example.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url!: string;
}