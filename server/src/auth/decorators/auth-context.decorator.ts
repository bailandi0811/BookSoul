import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthContext } from '../auth-context';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<{
      authContext: AuthContext;
    }>();
    return request.authContext;
  },
);
