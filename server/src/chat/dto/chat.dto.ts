import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  message!: string;

  @IsOptional()
  @IsIn(['assistant', 'qiaofeng', 'duanyu', 'wangyuyan'])
  character?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(128)
  sessionId?: string;
}
