import { ReadingMode } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateReadingProgressDto {
  @IsEnum(ReadingMode)
  mode!: ReadingMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  currentSectionOrder?: number | null;
}
