import { Prisma, User } from '@prisma/client';
export async function lockAuthUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<User | null> {
  const rows = await tx.$queryRaw<
    User[]
  >`SELECT * FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  return rows[0] ?? null;
}
