import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { COMMUNITY_ROOM_ID } from '../community/community.policy';
export function parseModeratorArguments(args: string[]) {
  const ids = args.filter((arg) => arg.startsWith('--member-id='));
  if (
    ids.length !== 1 ||
    args.some((arg) => arg !== '--apply' && !arg.startsWith('--member-id=')) ||
    args.filter((arg) => arg === '--apply').length > 1
  )
    throw new Error(
      'Specify one --member-id=<public UUID>; default is preview, --apply writes one membership.',
    );
  const memberId = ids[0].slice('--member-id='.length);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      memberId,
    )
  )
    throw new Error('A public member UUID is required.');
  return { memberId, apply: args.includes('--apply') };
}
async function main() {
  const options = parseModeratorArguments(process.argv.slice(2));
  const raw = process.env.DATABASE_URL;
  if (!raw)
    throw new Error(
      'Explicit DATABASE_URL is required; this script does not load .env.',
    );
  const url = new URL(raw);
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1) ||
    url.searchParams.getAll('schema').length > 1 ||
    url.searchParams.has('host')
  )
    throw new Error('Ambiguous database target.');
  const targetFingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        url.hostname.toLowerCase(),
        url.port || '5432',
        decodeURIComponent(url.pathname.slice(1)),
        url.searchParams.get('schema') || 'public',
      ]),
    )
    .digest('hex')
    .slice(0, 16);
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  try {
    const member = await db.communityMember.findFirst({
      where: { id: options.memberId, roomId: COMMUNITY_ROOM_ID },
      select: { id: true, isModerator: true },
    });
    if (!member)
      throw new Error('The exact public room membership does not exist.');
    console.log(
      JSON.stringify({
        targetFingerprint,
        memberId: member.id,
        mode: options.apply ? 'apply' : 'preview',
        affectedRows: member.isModerator ? 0 : 1,
      }),
    );
    if (options.apply)
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "CommunityRoom" WHERE "id" = ${COMMUNITY_ROOM_ID} FOR UPDATE`;
        await tx.communityMember.update({
          where: { id: member.id, roomId: COMMUNITY_ROOM_ID },
          data: { isModerator: true },
        });
      });
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      'Moderator command failed. Verify the explicit target and exact public membership.',
    );
    process.exitCode = 1;
  });
