import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { finalize, type Observable } from 'rxjs';
import type { AuthContext } from '../auth/auth-context';
import { uploadError } from './book-upload.policy';

@Injectable()
export class LegacyBookUploadLimitInterceptor implements NestInterceptor {
  private readonly owners = new Set<string>();
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auth = context
      .switchToHttp()
      .getRequest<{ authContext?: AuthContext }>().authContext;
    if (auth?.kind !== 'user') throw new UnauthorizedException();
    if (this.owners.size >= 2 || this.owners.has(auth.userId))
      uploadError(429, 'BOOK_UPLOAD_LIMIT', '上传较多，请稍后重试');
    this.owners.add(auth.userId);
    try {
      return next
        .handle()
        .pipe(finalize(() => this.owners.delete(auth.userId)));
    } catch (error) {
      this.owners.delete(auth.userId);
      throw error;
    }
  }
}
