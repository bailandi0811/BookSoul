import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentAuth } from '../../auth/decorators/auth-context.decorator';
import type { AuthContext } from '../../auth/auth-context';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserProfileService } from './user-profile.service';
import { ProfileMediaService } from './profile-media.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { CommitMediaUploadDto } from './dto/commit-media-upload.dto';
import { assertMediaInput } from './profile.policy';

@Controller('api/users/me')
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  constructor(
    private readonly profile: UserProfileService,
    private readonly media: ProfileMediaService,
  ) {}

  @Get('profile')
  @Header('Cache-Control', 'no-store')
  getProfile(@CurrentAuth() auth: AuthContext) {
    const ownerId = this.owner(auth);
    return this.profile
      .getProfile(ownerId)
      .then((data) => ({ success: true, data }));
  }
  @Patch('profile')
  @Header('Cache-Control', 'no-store')
  async updateProfile(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdateProfileDto,
  ) {
    return {
      success: true,
      data: await this.profile.updateProfile(this.owner(auth), dto),
    };
  }
  @Post('media/uploads')
  @Header('Cache-Control', 'no-store')
  async createUpload(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateMediaUploadDto,
  ) {
    return {
      success: true,
      data: await this.media.createUpload(
        this.owner(auth),
        assertMediaInput(dto.purpose, dto.contentType, dto.byteSize),
      ),
    };
  }
  @Post('media/uploads/:assetId/commit')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async commit(
    @CurrentAuth() auth: AuthContext,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body() dto: CommitMediaUploadDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ownerId = this.owner(auth);
    const controller = new AbortController();
    const cancel = () => {
      if (!response.writableEnded) controller.abort();
    };
    request.on('aborted', cancel);
    response.on('close', cancel);
    try {
      return {
        success: true,
        data: await this.media.commit(
          ownerId,
          assetId,
          dto.expectedRevision,
          controller.signal,
        ),
      };
    } finally {
      request.removeListener('aborted', cancel);
      response.removeListener('close', cancel);
    }
  }
  @Delete('wallpapers/:assetId')
  @Header('Cache-Control', 'no-store')
  async deleteWallpaper(
    @CurrentAuth() auth: AuthContext,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body() dto: CommitMediaUploadDto,
  ) {
    return {
      success: true,
      data: await this.profile.deleteWallpaper(
        this.owner(auth),
        assetId,
        dto.expectedRevision,
      ),
    };
  }
  private owner(auth: AuthContext): string {
    if (auth?.kind !== 'user') throw new UnauthorizedException();
    return auth.userId;
  }
}
