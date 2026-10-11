import type { Prisma } from '@prisma/client';
import { uploadError } from './book-upload.policy';

// Call only while holding the authenticated user's row lock.
export async function assertBookStorageQuota(
  tx: Prisma.TransactionClient,
  ownerId: string,
  bytes: number,
  excludeSession?: string,
) {
  const now = new Date();
  const active = await tx.bookUploadSession.findMany({
    where: {
      ownerId,
      ...(excludeSession ? { id: { not: excludeSession } } : {}),
      status: { in: ['UPLOADING', 'FINALIZING'] },
      OR: [
        { expiresAt: { gt: now } },
        { status: 'FINALIZING', leaseExpiresAt: { gt: now } },
      ],
    },
    select: { declaredBytes: true },
  });
  const stored = await tx.book.aggregate({
    where: { ownerId },
    _sum: { fileSizeBytes: true },
  });
  const reserved = active.reduce((sum, item) => sum + item.declaredBytes, 0);
  if (
    BigInt(reserved + bytes) + (stored._sum.fileSizeBytes ?? 0n) >
    1024n ** 3n
  )
    uploadError(
      429,
      'BOOK_STORAGE_QUOTA',
      '书籍存储已达到 1 GiB 上限，请先删除不需要的书籍',
    );
  return active;
}
