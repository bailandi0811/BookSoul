import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getAccessTokenSecret } from '../auth/access-token.config';
import type { AuthContext } from '../auth/auth-context';

export interface CommunityTicketRequest {
  headers: { authorization?: string; origin?: string };
  authContext?: AuthContext;
  communityClaims?: { userId: string; authVersion: number; expiresAt: number };
}
@Injectable()
export class CommunityTicketGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CommunityTicketRequest>();
    try {
      const token = /^Bearer (.+)$/i.exec(
        request.headers.authorization ?? '',
      )?.[1];
      if (!token || request.authContext?.kind !== 'user')
        throw new Error('invalid');
      const claims: unknown = await this.jwt.verifyAsync(token, {
        secret: getAccessTokenSecret(this.config),
        algorithms: ['HS256'],
      });
      if (
        !claims ||
        typeof claims !== 'object' ||
        !('sub' in claims) ||
        claims.sub !== request.authContext.userId ||
        !('type' in claims) ||
        claims.type !== 'access' ||
        !('exp' in claims) ||
        typeof claims.exp !== 'number' ||
        !Number.isSafeInteger(claims.exp) ||
        claims.exp * 1000 <= Date.now()
      )
        throw new Error('invalid');
      const version = 'authVersion' in claims ? claims.authVersion : 0;
      if (
        typeof version !== 'number' ||
        !Number.isSafeInteger(version) ||
        version < 0 ||
        !Number.isSafeInteger(claims.exp * 1000)
      )
        throw new Error('invalid');
      request.communityClaims = {
        userId: request.authContext.userId,
        authVersion: version,
        expiresAt: claims.exp * 1000,
      };
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'COMMUNITY_AUTH_INVALID',
        message: '访问令牌无效或已过期',
      });
    }
  }
}
