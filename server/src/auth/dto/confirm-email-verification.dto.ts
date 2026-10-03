import { IsString, IsUUID, Matches } from 'class-validator';
export class ConfirmEmailVerificationDto {
  @IsUUID()
  verificationId!: string;
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: '请输入 6 位验证码' })
  code!: string;
}
export class RequestCurrentUserCodeDto {}
