import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: '密码至少需要 8 个字符' })
  @MaxLength(72, { message: '密码最多允许 72 个字符' })
  password!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: '名称不能为空' })
  @MaxLength(50, { message: '名称最多允许 50 个字符' })
  name!: string;
}
