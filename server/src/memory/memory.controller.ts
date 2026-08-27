import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryLevel } from './interfaces/memory.types';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import type { AuthContext } from '../auth/auth-context';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  CreateMemoryDto,
  SearchMemoryQueryDto,
  UpdateMemoryDto,
  UpdateProfileDto,
} from './dto/memory.dto';

@Controller('api/memory')
@UseGuards(OptionalJwtAuthGuard)
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  // ========== User Profile ==========

  @Get('profile/:userId/:sessionId')
  async getProfile(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    this.assertCompatibleUserId(userId, auth);
    return this.memoryService.getOrCreateUserProfile(auth.userId, sessionId);
  }

  @Patch('profile/:userId/:sessionId')
  async updateProfile(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateProfileDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    this.assertCompatibleUserId(userId, auth);
    return this.memoryService.updateUserProfile(auth.userId, sessionId, body);
  }

  // ========== Memory CRUD ==========

  @Get('search/:userId')
  async searchMemories(
    @Param('userId') userId: string,
    @CurrentAuth() auth: AuthContext,
    @Query() query: SearchMemoryQueryDto,
  ) {
    this.assertCompatibleUserId(userId, auth);
    return this.memoryService.searchMemories(query.q, auth.userId, query.topK);
  }

  @Get(':userId/:sessionId')
  async getMemories(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @CurrentAuth() auth: AuthContext,
    @Query('level') level?: MemoryLevel,
  ) {
    this.assertCompatibleUserId(userId, auth);
    return this.memoryService.getMemories(auth.userId, sessionId, level);
  }

  @Post()
  async createMemory(
    @Body() body: CreateMemoryDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.memoryService.createMemory(auth.userId, body);
  }

  @Patch(':memoryId')
  async updateMemory(
    @Param('memoryId') memoryId: string,
    @Body() body: UpdateMemoryDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.memoryService.updateMemory(memoryId, auth.userId, body);
  }

  @Delete(':memoryId')
  async deleteMemory(
    @Param('memoryId') memoryId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    await this.memoryService.deleteMemory(memoryId, auth.userId);
    return { success: true };
  }

  private assertCompatibleUserId(userId: string, auth: AuthContext): void {
    if (userId !== auth.userId) {
      throw new ForbiddenException('不能访问其他用户的数据');
    }
  }
}
