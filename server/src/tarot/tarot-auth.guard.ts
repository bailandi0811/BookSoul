import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { tarotError } from './tarot.policy';

@Injectable()
export class TarotAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException)
        throw tarotError(401, 'TAROT_UNAUTHENTICATED');
      throw error;
    }
  }
}
