import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveIsolatedDatabaseUrl } from '../../prisma/testing/isolated-database';
import type { PrismaService } from '../../prisma/prisma.service';
import { UserProfileService } from './user-profile.service';
import { ProfileMediaService } from './profile-media.service';
import { ProfileMediaStorage } from './profile-media.storage';
import type { ProfileImageService } from './profile-image.service';

// The dedicated command refuses to construct a client without proven isolation.
const isolatedUrl = resolveIsolatedDatabaseUrl(process.env);
const db = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
const createdUsers: string[] = [];
const storage = {
  configured: true,
  createUpload: () =>
    Promise.resolve({
      method: 'POST',
      url: 'https://fixture.invalid',
      fields: {},
    }),
  head: () => Promise.resolve({ byteSize: 10, contentType: 'image/png' }),
  readBounded: () => Promise.resolve(Buffer.alloc(10)),
  putPrivate: () => Promise.resolve(),
  signRead: () => Promise.resolve('https://fixture.invalid/image'),
} as unknown as ProfileMediaStorage;
const profile = new UserProfileService(db as unknown as PrismaService, storage);
const media = new ProfileMediaService(
  db as unknown as PrismaService,
  profile,
  storage,
  {
    normalizeImage: () =>
      Promise.resolve({
        bytes: Buffer.from('out'),
        width: 512,
        height: 512,
        contentType: 'image/png',
      }),
  } as unknown as ProfileImageService,
);

describe('isolated profile transactions', () => {
  afterAll(async () => {
    try {
      if (createdUsers.length) {
        await db.user.updateMany({
          where: { id: { in: createdUsers } },
          data: { avatarAssetId: null },
        });
        await db.userMediaAsset.deleteMany({
          where: { ownerId: { in: createdUsers } },
        });
        await db.user.deleteMany({ where: { id: { in: createdUsers } } });
      }
    } finally {
      await db.$disconnect();
    }
  });
  async function user() {
    const row = await db.user.create({
      data: {
        email: `profile-${randomUUID()}@example.invalid`,
        name: 'Fixture',
        passwordHash: 'fixture-unused-hash',
      },
    });
    createdUsers.push(row.id);
    return row;
  }
  it('only accepts one concurrent update for the same revision', async () => {
    const row = await user();
    const results = await Promise.allSettled([
      profile.updateProfile(row.id, { name: 'First', expectedRevision: 0 }),
      profile.updateProfile(row.id, { name: 'Second', expectedRevision: 0 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: row.id } }))
        .profileRevision,
    ).toBe(1);
  });
  it('serializes the persistent pending avatar quota across concurrent signings', async () => {
    const row = await user();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        media.createUpload(row.id, {
          purpose: 'AVATAR',
          contentType: 'image/png',
          byteSize: 10,
          extension: 'png',
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await db.userMediaAsset.count({ where: { ownerId: row.id } })).toBe(
      3,
    );
  });
  it('retires a fixed wallpaper in the same transaction that resets selection', async () => {
    const row = await user();
    const id = randomUUID();
    await db.userMediaAsset.create({
      data: {
        id,
        ownerId: row.id,
        purpose: 'WALLPAPER',
        status: 'READY',
        uploadKey: `fixture/${id}/input`,
        objectKey: `fixture/${id}/output`,
        declaredMime: 'image/png',
        declaredBytes: 10,
        storedBytes: 10,
        width: 1,
        height: 1,
        uploadExpiresAt: new Date(),
        commitExpiresAt: new Date(),
      },
    });
    await profile.updateProfile(row.id, {
      wallpaper: { mode: 'FIXED', kind: 'USER', id },
      expectedRevision: 0,
    });
    const result = await profile.deleteWallpaper(row.id, id, 1);
    expect(result.wallpaper).toEqual({ mode: 'RANDOM' });
    expect(result.revision).toBe(2);
    expect(
      (
        await db.userMediaAsset.findFirstOrThrow({
          where: { id, ownerId: row.id },
        })
      ).status,
    ).toBe('RETIRED');
  });
  it('concurrently acknowledges one upload and never restores its retired avatar', async () => {
    const row = await user();
    const ticket = await media.createUpload(row.id, {
      purpose: 'AVATAR',
      contentType: 'image/png',
      byteSize: 10,
      extension: 'png',
    });
    const results = await Promise.all([
      media.commit(row.id, ticket.assetId, 0),
      media.commit(row.id, ticket.assetId, 0),
    ]);
    expect(results.filter((result) => result.alreadyCommitted)).toHaveLength(1);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: row.id } }))
        .profileRevision,
    ).toBe(1);
    const replacement = await media.createUpload(row.id, {
      purpose: 'AVATAR',
      contentType: 'image/png',
      byteSize: 10,
      extension: 'png',
    });
    await media.commit(row.id, replacement.assetId, 1);
    expect(
      (await media.commit(row.id, ticket.assetId, 0)).alreadyCommitted,
    ).toBe(true);
    const current = await db.user.findUniqueOrThrow({ where: { id: row.id } });
    expect(current.avatarAssetId).toBe(replacement.assetId);
    expect(current.profileRevision).toBe(2);
  });
});
