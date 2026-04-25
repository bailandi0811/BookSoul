import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryLevel, MemoryCategory } from './interfaces/memory.types';

@Controller('api/memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  // ========== User Profile ==========

  @Get('profile/:userId/:sessionId')
  async getProfile(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.memoryService.getOrCreateUserProfile(userId, sessionId);
  }

  @Patch('profile/:userId/:sessionId')
  async updateProfile(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { preferences?: any; facts?: Record<string, string>; summary?: string },
  ) {
    return this.memoryService.updateUserProfile(userId, sessionId, body);
  }

  // ========== Memory CRUD ==========

  @Get(':userId/:sessionId')
  async getMemories(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Query('level') level?: MemoryLevel,
  ) {
    return this.memoryService.getMemories(userId, sessionId, level);
  }

  @Post()
  async createMemory(@Body() body: {
    userId: string;
    sessionId: string;
    content: string;
    level?: MemoryLevel;
    category?: MemoryCategory;
  }) {
    return this.memoryService.processAndStoreMemory(body.userId, body.sessionId, body.content);
  }

  @Patch(':memoryId')
  async updateMemory(
    @Param('memoryId') memoryId: string,
    @Body() body: { userId: string; content?: string; importance?: number; verified?: boolean },
  ) {
    return this.memoryService.updateMemory(memoryId, body.userId, body);
  }

  @Delete(':memoryId')
  async deleteMemory(
    @Param('memoryId') memoryId: string,
    @Query('userId') userId: string,
  ) {
    await this.memoryService.deleteMemory(memoryId, userId);
    return { success: true };
  }

  // ========== Semantic Search ==========

  @Get('search/:userId')
  async searchMemories(
    @Param('userId') userId: string,
    @Query('q') query: string,
    @Query('topK') topK: number = 5,
  ) {
    return this.memoryService.searchMemories(query, userId, topK);
  }
}