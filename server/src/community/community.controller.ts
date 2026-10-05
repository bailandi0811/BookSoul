import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Injectable,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { CommunityMembersService } from './community-members.service';
import { catchError, throwError } from 'rxjs';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthContext } from '../auth/auth-context';
import { CommunityService } from './community.service';
import { CommunityTicketsService } from './community.tickets.service';
import { CommunityEventsService } from './community.events.service';
import {
  CommunityTicketGuard,
  type CommunityTicketRequest,
} from './community-ticket.guard';
import { communityError, errorFrameData } from './community.policy';
import {
  parseJoin,
  parseMessageQuery,
  parseId,
  parseRead,
  parseHide,
  parseMute,
  parseVisibleRead,
  parseUnreadQuery,
} from './dto/community.dto';
import { CommunityModerationService } from './community.moderation.service';

@Injectable()
class CommunityResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<unknown>) {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    return next.handle().pipe(
      catchError((error: unknown) => {
        const failure = errorFrameData(error);
        if (failure.status === 429)
          response.setHeader('Retry-After', failure.retryAfterSeconds ?? 5);
        return throwError(() =>
          error instanceof HttpException
            ? error
            : communityError(503, 'COMMUNITY_UNAVAILABLE'),
        );
      }),
    );
  }
}
@Controller('api/community')
@UseGuards(JwtAuthGuard)
@UseInterceptors(CommunityResponseInterceptor)
export class CommunityController {
  constructor(
    private readonly community: CommunityService,
    private readonly tickets: CommunityTicketsService,
    private readonly events: CommunityEventsService,
    private readonly moderation: CommunityModerationService,
    private readonly members: CommunityMembersService,
  ) {}
  private user(auth: AuthContext) {
    if (auth.kind !== 'user')
      throw communityError(401, 'COMMUNITY_AUTH_REQUIRED');
    return auth.userId;
  }
  @Get('members')
  async membersSearch(
    @CurrentAuth() auth: AuthContext,
    @Query() query: unknown,
  ) {
    if (
      !query ||
      typeof query !== 'object' ||
      Array.isArray(query) ||
      Object.keys(query).some((k) => k !== 'q')
    )
      throw communityError(400, 'COMMUNITY_INVALID_INPUT');
    const q = 'q' in query ? query.q : '';
    if (typeof q !== 'string' || Array.from(q).length > 50)
      throw communityError(400, 'COMMUNITY_INVALID_INPUT');
    return {
      success: true,
      data: await this.members.search(this.user(auth), q.trim()),
    };
  }
  @Get('members/:id/avatar')
  async avatar(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const controller = new AbortController();
    const abort = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', abort);
    try {
      const bytes = await this.members.avatar(
        this.user(auth),
        parseId(id),
        AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      );
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(bytes);
    } finally {
      res.removeListener('close', abort);
    }
  }
  @Post('membership')
  @HttpCode(200)
  async join(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const userId = this.user(auth);
    const input = parseJoin(body);
    return {
      success: true,
      data: await this.community.join(userId, input.consentVersion),
    };
  }
  @Get('me')
  async me(@CurrentAuth() auth: AuthContext) {
    return {
      success: true,
      data: await this.community.summary(this.user(auth)),
    };
  }
  @Get('messages')
  async messages(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    const userId = this.user(auth);
    return {
      success: true,
      data: await this.community.listMessages(userId, parseMessageQuery(query)),
    };
  }
  @Post('ws-tickets')
  @HttpCode(200)
  @UseGuards(CommunityTicketGuard)
  async ticket(@Req() request: CommunityTicketRequest, @Body() body: unknown) {
    if (
      body !== undefined &&
      (body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length)
    )
      throw communityError(400, 'COMMUNITY_INVALID_INPUT');
    if (!request.communityClaims)
      throw communityError(401, 'COMMUNITY_AUTH_REQUIRED');
    return {
      success: true,
      data: await this.tickets.issue(
        request.communityClaims,
        request.headers.origin,
      ),
    };
  }
  @Delete('messages/:id')
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: unknown) {
    const message = await this.community.remove(this.user(auth), parseId(id));
    void this.events.sweep().catch(() => {});
    return { success: true, data: message };
  }
  @Post('read')
  @HttpCode(200)
  async read(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return {
      success: true,
      data: await this.community.markRead(
        this.user(auth),
        parseRead(body).throughSeq,
      ),
    };
  }
  @Post('visible-read')
  @HttpCode(200)
  async visibleRead(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return {
      success: true,
      data: await this.community.markVisibleRead(
        this.user(auth),
        parseVisibleRead(body).messageIds,
      ),
    };
  }
  @Get('unread-target')
  async unreadTarget(
    @CurrentAuth() auth: AuthContext,
    @Query() query: unknown,
  ) {
    const input = parseUnreadQuery(query);
    return {
      success: true,
      data: await this.community.unreadTarget(
        this.user(auth),
        input.kind,
        input.after,
      ),
    };
  }
  @Get('messages/:id/context')
  async context(@CurrentAuth() auth: AuthContext, @Param('id') id: unknown) {
    return {
      success: true,
      data: await this.community.messageContext(this.user(auth), parseId(id)),
    };
  }
  @Post('moderation/messages/:id/hide')
  @HttpCode(200)
  async hide(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: unknown,
    @Body() body: unknown,
  ) {
    const userId = this.user(auth);
    const input = parseHide(body);
    const message = await this.moderation.hide(
      userId,
      parseId(id),
      input.reason,
    );
    void this.events.sweep().catch(() => {});
    return { success: true, data: message };
  }
  @Post('moderation/members/:id/mute')
  @HttpCode(200)
  async mute(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: unknown,
    @Body() body: unknown,
  ) {
    const userId = this.user(auth);
    const input = parseMute(body);
    const result = await this.moderation.mute(userId, parseId(id), input);
    void this.events.sweep().catch(() => {});
    return { success: true, data: result };
  }
}
