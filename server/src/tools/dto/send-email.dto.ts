import { Equals, IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SendEmailDto {
  @IsEmail()
  @MaxLength(254)
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  text!: string;

  @Equals(true, { message: '必须明确确认后才能发送邮件' })
  confirmed!: true;
}
