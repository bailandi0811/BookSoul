import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MemoryCategory, MemoryLevel } from '../interfaces/memory.types';

class UserPreferencesDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  favoriteCharacters!: string[];

  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  interests!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UserPreferencesDto)
  preferences?: UserPreferencesDto;

  @IsOptional()
  @IsObject()
  facts?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  summary?: string;
}

export class CreateMemoryDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(128)
  sessionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  content!: string;

  @IsOptional()
  @IsEnum(MemoryLevel)
  level?: MemoryLevel;

  @IsOptional()
  @IsEnum(MemoryCategory)
  category?: MemoryCategory;
}

export class UpdateMemoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  content?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  importance?: number;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}

export class SearchMemoryQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  topK: number = 5;
}
