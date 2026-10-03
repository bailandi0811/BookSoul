import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { getAccessTokenSecret } from './access-token.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getAccessTokenSecret(configService),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: unknown) {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('type' in payload) ||
      !('sub' in payload) ||
      !('email' in payload) ||
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.email !== 'string' ||
      !payload.email
    ) {
      throw new UnauthorizedException('无效的访问令牌');
    }

    const version = 'authVersion' in payload ? payload.authVersion : 0;
    if (
      typeof version !== 'number' ||
      !Number.isSafeInteger(version) ||
      version < 0
    )
      throw new UnauthorizedException('无效的访问令牌');
    const state = await this.usersService.findAuthStateById(payload.sub);
    if (!state || state.authVersion !== version) {
      throw new UnauthorizedException('无效的访问令牌');
    }

    return state.user;
  }
}
