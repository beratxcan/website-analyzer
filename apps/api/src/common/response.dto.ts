import { ApiProperty } from '@nestjs/swagger';

/** API representation of a user (never contains the password hash). */
export class AuthUserResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ProjectResponseDto {
  @ApiProperty({ example: 'p1...' })
  id!: string;

  @ApiProperty({ example: 'My Project' })
  name!: string;

  @ApiProperty({ example: 'Optional description', nullable: true })
  description!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class WebsiteResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  projectId!: string;

  @ApiProperty({ example: 'Example' })
  name!: string;

  @ApiProperty({ example: 'https://example.com' })
  url!: string;

  @ApiProperty({ example: 'https://example.com' })
  normalizedUrl!: string;

  @ApiProperty({ example: 'example.com' })
  host!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}