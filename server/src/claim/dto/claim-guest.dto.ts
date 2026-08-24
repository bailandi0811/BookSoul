import { IsString, MaxLength, MinLength } from 'class-validator';

export class ClaimGuestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  guestUserId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  sessionId!: string;
}
