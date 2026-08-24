import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isObservable, lastValueFrom } from 'rxjs';
import { PublicUser } from '../../users/users.service';
import { AuthContext } from '../auth-context';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = super.canActivate(context);
    const activated = isObservable(result)
      ? await lastValueFrom(result)
      : await Promise.resolve(result);

    if (activated) {
      const request = context.switchToHttp().getRequest<{
        user: PublicUser;
        authContext?: AuthContext;
      }>();
      request.authContext = {
        kind: 'user',
        userId: request.user.id,
        email: request.user.email,
        name: request.user.name,
      };
    }
    return activated;
  }
}
