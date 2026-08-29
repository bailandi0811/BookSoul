import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requireSafePathSegment } from '../../auth/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { UserProfile } from '../interfaces/memory.types';

@Injectable()
export class UserProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, sessionId: string): Promise<UserProfile | null> {
    this.validateScope(userId, sessionId);
    const record = await this.prisma.userProfileRecord.findUnique({
      where: { ownerId_sessionId: { ownerId: userId, sessionId } },
    });
    return record ? this.toProfile(record) : null;
  }

  async getByUserId(userId: string): Promise<UserProfile[]> {
    requireSafePathSegment(userId, '用户标识');
    const records = await this.prisma.userProfileRecord.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'asc' },
    });
    return records.map((record) => this.toProfile(record));
  }

  async save(profile: UserProfile): Promise<void> {
    this.validateScope(profile.userId, profile.sessionId);
    const preferences = JSON.parse(
      JSON.stringify(profile.preferences),
    ) as Prisma.InputJsonValue;
    const facts = JSON.parse(
      JSON.stringify(profile.facts),
    ) as Prisma.InputJsonValue;

    await this.prisma.userProfileRecord.upsert({
      where: {
        ownerId_sessionId: {
          ownerId: profile.userId,
          sessionId: profile.sessionId,
        },
      },
      create: {
        ownerId: profile.userId,
        sessionId: profile.sessionId,
        preferences,
        facts,
        summary: profile.summary,
        createdAt: new Date(profile.createdAt),
        updatedAt: new Date(profile.updatedAt),
      },
      update: {
        preferences,
        facts,
        summary: profile.summary,
        updatedAt: new Date(profile.updatedAt),
      },
    });
  }

  async update(
    userId: string,
    sessionId: string,
    updates: Partial<UserProfile>,
  ): Promise<UserProfile> {
    const existing = await this.get(userId, sessionId);
    const currentPreferences = existing?.preferences ?? {
      favoriteCharacters: [],
      interests: [],
    };
    const updated: UserProfile = {
      userId,
      sessionId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferences: updates.preferences
        ? { ...currentPreferences, ...updates.preferences }
        : currentPreferences,
      facts: updates.facts ?? existing?.facts ?? {},
      summary: updates.summary ?? existing?.summary ?? '',
    };
    await this.save(updated);
    return updated;
  }

  async delete(userId: string, sessionId: string): Promise<void> {
    this.validateScope(userId, sessionId);
    await this.prisma.userProfileRecord.deleteMany({
      where: { ownerId: userId, sessionId },
    });
  }

  createDefault(userId: string, sessionId: string): UserProfile {
    this.validateScope(userId, sessionId);
    const now = new Date().toISOString();
    return {
      userId,
      sessionId,
      createdAt: now,
      updatedAt: now,
      preferences: {
        favoriteCharacters: [],
        interests: [],
      },
      facts: {},
      summary: '',
    };
  }

  private validateScope(userId: string, sessionId: string): void {
    requireSafePathSegment(userId, '用户标识');
    requireSafePathSegment(sessionId, '会话标识');
  }

  private toProfile(record: {
    ownerId: string;
    sessionId: string;
    preferences: Prisma.JsonValue;
    facts: Prisma.JsonValue;
    summary: string;
    createdAt: Date;
    updatedAt: Date;
  }): UserProfile {
    return {
      userId: record.ownerId,
      sessionId: record.sessionId,
      preferences: record.preferences as unknown as UserProfile['preferences'],
      facts: record.facts as unknown as UserProfile['facts'],
      summary: record.summary,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
