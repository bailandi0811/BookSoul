import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class ResetPasswordDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
