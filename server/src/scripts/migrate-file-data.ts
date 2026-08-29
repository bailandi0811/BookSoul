import { Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  MemoryEntry,
  UserProfile,
} from '../memory/interfaces/memory.types';

interface StoredChatSession {
  messages?: unknown[];
  userId?: string;
}

const prisma = new PrismaClient();
const serverRoot = process.cwd();

async function listDirectories(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function listJsonFiles(root: string): Promise<string[]> {
  try {
    const files = await fs.readdir(root);
    return files.filter((file) => file.endsWith('.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function migrateChatHistories(): Promise<number> {
  const root = path.join(serverRoot, 'chat_histories');
  const files = await listJsonFiles(root);
  let migrated = 0;

  for (const file of files) {
    const document = await readJson<
      Record<string, Record<string, StoredChatSession>>
    >(path.join(root, file));
    for (const [sessionId, session] of Object.entries(document[''] ?? {})) {
      if (!session.userId || !Array.isArray(session.messages)) continue;
      const stats = await fs.stat(path.join(root, file));
      await prisma.chatSessionRecord.upsert({
        where: {
          ownerId_sessionId: {
            ownerId: session.userId,
            sessionId,
          },
        },
        create: {
          sessionId,
          ownerId: session.userId,
          messages: asJson(session.messages),
          createdAt: stats.birthtime,
          updatedAt: stats.mtime,
        },
        update: {
          ownerId: session.userId,
          messages: asJson(session.messages),
          updatedAt: stats.mtime,
        },
      });
      migrated += 1;
    }
  }

  return migrated;
}

async function migrateProfiles(): Promise<number> {
  const root = path.join(serverRoot, 'memories', 'profiles');
  const owners = await listDirectories(root);
  let migrated = 0;

  for (const ownerId of owners) {
    const ownerRoot = path.join(root, ownerId);
    for (const file of await listJsonFiles(ownerRoot)) {
      const profile = await readJson<UserProfile>(path.join(ownerRoot, file));
      await prisma.userProfileRecord.upsert({
        where: {
          ownerId_sessionId: {
            ownerId: profile.userId,
            sessionId: profile.sessionId,
          },
        },
        create: {
          ownerId: profile.userId,
          sessionId: profile.sessionId,
          preferences: asJson(profile.preferences),
          facts: asJson(profile.facts),
          summary: profile.summary,
          createdAt: new Date(profile.createdAt),
          updatedAt: new Date(profile.updatedAt),
        },
        update: {
          preferences: asJson(profile.preferences),
          facts: asJson(profile.facts),
          summary: profile.summary,
          updatedAt: new Date(profile.updatedAt),
        },
      });
      migrated += 1;
    }
  }

  return migrated;
}

async function migrateMemories(): Promise<number> {
  const root = path.join(serverRoot, 'memories', 'long_term');
  const owners = await listDirectories(root);
  let migrated = 0;

  for (const ownerId of owners) {
    const ownerRoot = path.join(root, ownerId);
    for (const file of await listJsonFiles(ownerRoot)) {
      const memory = await readJson<MemoryEntry>(path.join(ownerRoot, file));
      await prisma.memoryRecord.upsert({
        where: { id: memory.id },
        create: {
          id: memory.id,
          ownerId: memory.userId,
          sessionId: memory.sessionId,
          level: memory.level,
          content: memory.content,
          importance: memory.importance,
          category: memory.category,
          metadata: asJson(memory.metadata),
          createdAt: new Date(memory.createdAt),
          updatedAt: new Date(memory.updatedAt),
        },
        update: {
          ownerId: memory.userId,
          sessionId: memory.sessionId,
          level: memory.level,
          content: memory.content,
          importance: memory.importance,
          category: memory.category,
          metadata: asJson(memory.metadata),
          updatedAt: new Date(memory.updatedAt),
        },
      });
      migrated += 1;
    }
  }

  return migrated;
}

async function bootstrap(): Promise<void> {
  const [chatCount, profileCount, memoryCount] = await Promise.all([
    migrateChatHistories(),
    migrateProfiles(),
    migrateMemories(),
  ]);

  console.log(
    `Migration copy complete: ${chatCount} chats, ${profileCount} profiles, ${memoryCount} memories. Source files were preserved.`,
  );
}

void bootstrap()
  .catch((error: unknown) => {
    console.error('File data migration failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
