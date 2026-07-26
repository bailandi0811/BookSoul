import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  refreshToken!: string;
}
