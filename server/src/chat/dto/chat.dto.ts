import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChatDto {
  @IsOptional()
  @IsIn(['quick', 'deep'])
  retrievalMode?: 'quick' | 'deep';
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  message!: string;

  @IsUUID()
  sessionId!: string;

  @IsOptional()
  @IsBoolean()
  spoilerOverride?: boolean;

  @IsOptional()
  @IsBoolean()
  externalResearch?: boolean;
}
