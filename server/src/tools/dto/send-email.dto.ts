import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendEmailDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(254)
  to!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/\S/, { message: '邮件主题不能为空' })
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  @Matches(/\S/, { message: '邮件正文不能为空' })
  text!: string;

  @Equals(true, { message: '必须明确确认后才能发送邮件' })
  confirmed!: true;
}
