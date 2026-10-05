import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { parseProfileMediaConfig } from '../config/profile-media.config';
import { OssProfileMediaStorage } from '../users/profile/oss-profile-media.storage';
import { ProfileMediaCleanupService } from '../users/profile/profile-media-cleanup.service';
import type { PrismaService } from '../prisma/prisma.service';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--execute'))
    throw new Error('Only --execute is supported; default is dry-run');
  const config = parseProfileMediaConfig(process.env);
  if (!config) throw new Error('OSS profile media is not configured');
  const prisma = new PrismaClient();
  try {
    const cleanup = new ProfileMediaCleanupService(
      prisma as unknown as PrismaService,
      new OssProfileMediaStorage(config),
    );
    const result = await cleanup.cleanup({
      dryRun: !args.includes('--execute'),
      limit: 100,
    });
    console.log(
      JSON.stringify({ dryRun: !args.includes('--execute'), ...result }),
    );
    if (result.failed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Profile media cleanup failed; verify configuration and scoped access.',
  );
  process.exitCode = 1;
});
