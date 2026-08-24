import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { UserProfile, UserPreferences } from '../interfaces/memory.types';
import { requireSafePathSegment, resolveWithinRoot } from '../../auth/auth-context';

@Injectable()
export class UserProfileRepository {
  private readonly logger = new Logger(UserProfileRepository.name);
  private readonly baseDir = 'memories/profiles';

  async get(userId: string, sessionId: string): Promise<UserProfile | null> {
    try {
      const filePath = this.getFilePath(userId, sessionId);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as UserProfile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      this.logger.error('Failed to load user profile');
      throw error;
    }
  }

  async save(profile: UserProfile): Promise<void> {
    try {
      const dir = this.getUserDirectory(profile.userId);
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${profile.sessionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(profile, null, 2));
    } catch (error) {
      this.logger.error('Failed to save user profile');
      throw error;
    }
  }

  async update(userId: string, sessionId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const existing = await this.get(userId, sessionId);
    const updated: UserProfile = {
      userId,
      sessionId,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferences: existing?.preferences || { favoriteCharacters: [], interests: [] },
      facts: existing?.facts || {},
      summary: existing?.summary || '',
      ...updates,
    };

    await this.save(updated);
    return updated;
  }

  async delete(userId: string, sessionId: string): Promise<void> {
    try {
      const filePath = this.getFilePath(userId, sessionId);
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  createDefault(userId: string, sessionId: string): UserProfile {
    return {
      userId,
      sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferences: {
        favoriteCharacters: [],
        interests: [],
      },
      facts: {},
      summary: '',
    };
  }

  private getFilePath(userId: string, sessionId: string): string {
    requireSafePathSegment(sessionId, '会话标识');
    return resolveWithinRoot(
      this.getUserDirectory(userId),
      `${sessionId}.json`,
    );
  }

  private getUserDirectory(userId: string): string {
    requireSafePathSegment(userId, '用户标识');
    return resolveWithinRoot(path.join(process.cwd(), this.baseDir), userId);
  }
}
