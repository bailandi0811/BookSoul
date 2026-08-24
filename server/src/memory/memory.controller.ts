import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryLevel, MemoryCategory } from './interfaces/memory.types';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import type { AuthContext } from '../auth/auth-context';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

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
    @Body() body: { preferences?: any; facts?: Record<string, string>; summary?: string },
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
    @Query('q') query: string,
    @Query('topK') topK: number = 5,
  ) {
    this.assertCompatibleUserId(userId, auth);
    return this.memoryService.searchMemories(query, auth.userId, topK);
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
  async createMemory(@Body() body: {
    userId?: string;
    sessionId: string;
    content: string;
    level?: MemoryLevel;
    category?: MemoryCategory;
  }, @CurrentAuth() auth: AuthContext) {
    if (body.userId) this.assertCompatibleUserId(body.userId, auth);
    return this.memoryService.processAndStoreMemory(auth.userId, body.sessionId, body.content);
  }

  @Patch(':memoryId')
  async updateMemory(
    @Param('memoryId') memoryId: string,
    @Body() body: { userId?: string; content?: string; importance?: number; verified?: boolean },
    @CurrentAuth() auth: AuthContext,
  ) {
    if (body.userId) this.assertCompatibleUserId(body.userId, auth);
    const updates = { ...body };
    delete updates.userId;
    return this.memoryService.updateMemory(memoryId, auth.userId, updates);
  }

  @Delete(':memoryId')
  async deleteMemory(
    @Param('memoryId') memoryId: string,
    @Query('userId') userId: string | undefined,
    @CurrentAuth() auth: AuthContext,
  ) {
    if (userId) this.assertCompatibleUserId(userId, auth);
    await this.memoryService.deleteMemory(memoryId, auth.userId);
    return { success: true };
  }

  private assertCompatibleUserId(userId: string, auth: AuthContext): void {
    if (userId !== auth.userId) {
      throw new ForbiddenException('不能访问其他用户的数据');
    }
  }
}
