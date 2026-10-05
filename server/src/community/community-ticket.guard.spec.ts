import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { ExecutionContext } from '@nestjs/common';
import { CommunityTicketGuard } from './community-ticket.guard';

describe('verified access token ticket claims', () => {
  const jwt = new JwtService({ secret: 'fixture-only-test-signing-key' });
  const guard = new CommunityTicketGuard(jwt, {
    get: () => 'fixture-only-test-signing-key',
  } as unknown as ConfigService);
  function context(token: string) {
    const request = {
      headers: { authorization: `Bearer ${token}` },
      authContext: { kind: 'user', userId: 'fixture' },
    };
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  }
  it('rejects_missing_exp_or_unverified_claims', async () => {
    for (const token of [
      jwt.sign({ sub: 'fixture', type: 'access' }),
      jwt.sign(
        {
          sub: 'fixture',
          type: 'access',
          exp: Math.floor(Date.now() / 1000) + 60,
        },
        { secret: 'another-fixture-key' },
      ),
    ]) {
      const input = context(token);
      await expect(guard.canActivate(input.context)).rejects.toMatchObject({
        status: 401,
      });
    }
  });
  it('binds_verified_expiry_and_version_to_trusted_user', async () => {
    const input = context(
      jwt.sign({
        sub: 'fixture',
        type: 'access',
        authVersion: 2,
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    );
    expect(await guard.canActivate(input.context)).toBe(true);
    expect(input.request).toHaveProperty(
      'communityClaims',
      expect.objectContaining({ userId: 'fixture', authVersion: 2 }),
    );
  });
});
