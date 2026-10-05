import type { Prisma, User, UserMediaAsset } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { ProfileMediaStorage } from '../../src/users/profile/profile-media.storage';

export const PROFILE_OWNER = '22222222-2222-4222-8222-222222222222';
export function profileFixture() {
  const now = new Date();
  const user: User = {
    id: PROFILE_OWNER,
    email: 'profile@example.invalid',
    name: 'Reader',
    passwordHash: 'fixture-hash',
    emailVerifiedAt: null,
    authVersion: 0,
    createdAt: now,
    updatedAt: now,
    avatarAssetId: null,
    wallpaperMode: 'RANDOM',
    fixedWallpaperKind: null,
    fixedWallpaperId: null,
    profileRevision: 0,
  };
  const assets: UserMediaAsset[] = [];
  const matches = (asset: UserMediaAsset, where: Record<string, unknown>) => {
    for (const key of ['id', 'ownerId', 'purpose', 'status']) {
      if (
        where[key] !== undefined &&
        asset[key as keyof UserMediaAsset] !== where[key]
      )
        return false;
    }
    return true;
  };
  const tx = {
    $queryRaw: jest
      .fn()
      .mockImplementation(() => Promise.resolve([{ ...user }])),
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...user })),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const previousRevision = user.profileRevision;
          const revision = data.profileRevision as
            | { increment?: number }
            | number
            | undefined;
          Object.assign(user, data);
          if (typeof revision === 'object')
            user.profileRevision = previousRevision + (revision.increment ?? 0);
          return Promise.resolve({ ...user });
        }),
    },
    userMediaAsset: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: Record<string, unknown> }) => {
          if (!where.ownerId && !where.OR)
            throw new Error('Missing owner filter');
          return Promise.resolve(
            assets.filter((a) => matches(a, where)).map((a) => ({ ...a })),
          );
        }),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(assets.find((a) => matches(a, where)) ?? null),
        ),
      update: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<UserMediaAsset>;
          }) => {
            const asset = assets.find((a) => a.id === where.id)!;
            Object.assign(asset, data);
            return Promise.resolve({ ...asset });
          },
        ),
      updateMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Partial<UserMediaAsset>;
          }) => {
            const selected = assets.filter((a) => matches(a, where));
            selected.forEach((a) => Object.assign(a, data));
            return Promise.resolve({ count: selected.length });
          },
        ),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: UserMediaAsset }) => {
          assets.push({ ...data, createdAt: now, updatedAt: now });
          return Promise.resolve(assets[assets.length - 1]);
        }),
    },
  };
  const db = {
    ...tx,
    $transaction: jest
      .fn()
      .mockImplementation((run: (value: Prisma.TransactionClient) => unknown) =>
        Promise.resolve(run(tx as unknown as Prisma.TransactionClient)),
      ),
  };
  const storage = {
    configured: true,
    signRead: jest
      .fn()
      .mockResolvedValue('https://fixture.invalid/image?signature=fixture'),
    createUpload: jest
      .fn()
      .mockResolvedValue({
        method: 'POST',
        url: 'https://fixture.invalid',
        fields: {},
      }),
    head: jest.fn(),
    readBounded: jest.fn(),
    putPrivate: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  function media(
    purpose: 'AVATAR' | 'WALLPAPER' = 'WALLPAPER',
    ownerId = PROFILE_OWNER,
  ): UserMediaAsset {
    const id = `33333333-3333-4333-8333-${String(assets.length + 1).padStart(12, '0')}`;
    const asset: UserMediaAsset = {
      id,
      ownerId,
      purpose,
      status: 'READY',
      uploadKey: `booksoul/profile/staging/${ownerId}/${id}.png`,
      objectKey: `booksoul/profile/assets/${ownerId}/${purpose}/${id}.webp`,
      declaredMime: 'image/png',
      declaredBytes: 50,
      width: 100,
      height: 100,
      storedBytes: 50,
      uploadExpiresAt: new Date(now.getTime() + 300000),
      commitExpiresAt: new Date(now.getTime() + 1800000),
      createdAt: now,
      updatedAt: now,
      retiredAt: null,
      stagingCleanedAt: null,
    };
    assets.push(asset);
    return asset;
  }
  return {
    user,
    assets,
    tx,
    db,
    storage,
    media,
    prisma: db as unknown as PrismaService,
    mediaStorage: storage as unknown as ProfileMediaStorage,
  };
}
