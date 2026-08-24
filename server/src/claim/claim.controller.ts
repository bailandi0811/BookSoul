import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  GUEST_USER_HEADER,
  type AuthContext,
} from '../auth/auth-context';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SuccessResponse } from '../auth/auth.types';
import { ClaimService, type ClaimGuestResult } from './claim.service';
import { ClaimGuestDto } from './dto/claim-guest.dto';

@Controller('api/auth')
export class ClaimController {
  constructor(private readonly claimService: ClaimService) {}

  @Post('claim-guest')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async claimGuest(
    @Body() dto: ClaimGuestDto,
    @Headers(GUEST_USER_HEADER) guestHeader: string | undefined,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<ClaimGuestResult>> {
    if (guestHeader !== dto.guestUserId) {
      throw new ForbiddenException('访客身份不匹配');
    }
    return {
      success: true,
      data: await this.claimService.claimGuest(
        dto.guestUserId,
        dto.sessionId,
        auth.userId,
      ),
    };
  }
}
