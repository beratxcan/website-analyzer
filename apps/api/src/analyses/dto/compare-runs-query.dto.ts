import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CompareRunsQueryDto {
  @ApiProperty({ description: 'Run id used as the baseline (older) side' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  leftRunId!: string;

  @ApiProperty({ description: 'Run id used as the current (newer) side' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  rightRunId!: string;
}
