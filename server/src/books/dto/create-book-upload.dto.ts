import {
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BOOK_UPLOAD_MAX_BYTES } from '../book-upload.policy';

export class CreateBookUploadDto {
  @IsUUID('4') requestId!: string;
  @IsString() @MaxLength(255) fileName!: string;
  @IsInt() @Min(1) @Max(BOOK_UPLOAD_MAX_BYTES) byteSize!: number;
  @IsString() @Matches(/^[0-9a-f]{64}$/) sha256!: string;
}
