import { CommunityController } from './community.controller';
import type { CommunityService } from './community.service';
import type { CommunityTicketsService } from './community.tickets.service';
import type { CommunityEventsService } from './community.events.service';
import type { CommunityModerationService } from './community.moderation.service';
import type { CommunityMembersService } from './community-members.service';

describe('public REST contract', () => {
  const auth = {
    kind: 'user' as const,
    userId: 'fixture-user',
    email: 'fixture@example.invalid',
    name: 'Reader',
  };
  function setup() {
    const service = {
      join: jest.fn(async () => ({ memberId: 'member' })),
      summary: jest.fn(async () => ({ memberId: 'member' })),
      listMessages: jest.fn(async () => ({ messages: [] })),
    };
    const controller = new CommunityController(
      service as unknown as CommunityService,
      {} as CommunityTicketsService,
      {} as CommunityEventsService,
      {} as CommunityModerationService,
      {} as CommunityMembersService,
    );
    return { controller, service };
  }
  it('rejects_guest_and_scope_spoofing_before_business_calls', async () => {
    const { controller, service } = setup();
    await expect(
      controller.join(
        { kind: 'guest', userId: 'guest' },
        { consentVersion: '2026-10-04' },
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      controller.join(auth, {
        consentVersion: '2026-10-04',
        userId: 'another',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(service.join).not.toHaveBeenCalled();
  });
  it('uses_only_trusted_identity_and_restricts_query_fields', async () => {
    const { controller, service } = setup();
    await controller.join(auth, { consentVersion: '2026-10-04' });
    expect(service.join).toHaveBeenCalledWith(auth.userId, '2026-10-04');
    await expect(
      controller.messages(auth, { bookId: 'private-book' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(service.listMessages).not.toHaveBeenCalled();
  });
});
