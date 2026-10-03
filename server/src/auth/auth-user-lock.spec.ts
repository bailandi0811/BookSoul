import { Prisma } from '@prisma/client';
import { lockAuthUser } from './auth-user-lock';
describe('shared user row lock', () => {
  it('keeps the identity parameter separate from SQL and returns the locked snapshot', async () => {
    const maliciousId = "fixture' OR 1=1 --";
    const row = {
      id: maliciousId,
      authVersion: 3,
      passwordHash: 'fixture-only',
    };
    const query = jest.fn().mockResolvedValue([row]);
    const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
    expect(await lockAuthUser(tx, maliciousId)).toBe(row);
    const [strings, value] = query.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(strings.join('?')).not.toContain(maliciousId);
    expect(value).toBe(maliciousId);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('does not invent a user when the locked row is missing', async () => {
    expect(
      await lockAuthUser(
        {
          $queryRaw: jest.fn().mockResolvedValue([]),
        } as unknown as Prisma.TransactionClient,
        'fixture',
      ),
    ).toBeNull();
  });
});
