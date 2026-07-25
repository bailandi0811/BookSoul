import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
