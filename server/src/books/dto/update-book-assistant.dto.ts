import { AssistantResponseDepth, AssistantTone } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  BOOK_ASSISTANT_INSTRUCTION_MAX_LENGTH,
  BOOK_ASSISTANT_NAME_MAX_LENGTH,
} from '../book-assistant.policy';

export class UpdateBookAssistantDto {
  @IsOptional()
  @IsString()
  @MaxLength(BOOK_ASSISTANT_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsEnum(AssistantResponseDepth)
  responseDepth?: AssistantResponseDepth;

  @IsOptional()
  @IsEnum(AssistantTone)
  tone?: AssistantTone;

  @IsOptional()
  @IsString()
  @MaxLength(BOOK_ASSISTANT_INSTRUCTION_MAX_LENGTH)
  customInstruction?: string | null;
}
