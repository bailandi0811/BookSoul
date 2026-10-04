import { IsInt, IsString, Matches, Max, Min, MinLength } from 'class-validator';
import type { SaveReaderPositionInput } from '../book-reader.types';

export class UpdateReaderPositionDto implements SaveReaderPositionInput {
  @IsString()
  @MinLength(1)
  sectionId!: string;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset!: number;

  @Matches(/^[a-f0-9]{64}$/)
  contentHash!: string;

  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number;
}
