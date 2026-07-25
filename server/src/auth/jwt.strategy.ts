import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { getAccessTokenSecret } from './access-token.config';
import { AccessTokenPayload } from './auth.types';

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

  async validate(payload: AccessTokenPayload) {
    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.email !== 'string' ||
      !payload.email
    ) {
      throw new UnauthorizedException('无效的访问令牌');
    }

    const user = await this.usersService.findPublicById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('无效的访问令牌');
    }

    return user;
  }
}
