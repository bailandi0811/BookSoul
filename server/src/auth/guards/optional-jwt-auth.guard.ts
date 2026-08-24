import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { GUEST_USER_HEADER, requireGuestUserId } from '../auth-context';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;

    if (authorization) {
      return super.canActivate(context);
    }

    const header = request.headers[GUEST_USER_HEADER];
    const guestUserId = requireGuestUserId(
      Array.isArray(header) ? header[0] : header,
    );
    (request as Request & { authContext: unknown }).authContext = {
      kind: 'guest',
      userId: guestUserId,
    };
    return true;
  }
}
