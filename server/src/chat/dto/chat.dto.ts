import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChatDto {
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
