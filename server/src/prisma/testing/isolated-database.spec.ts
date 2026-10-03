import { resolveIsolatedDatabaseUrl } from './isolated-database';

describe('isolated database safety gate', () => {
  const applicationUrl = 'postgresql://fixture:unused@localhost/booksoul';
  const testUrl =
    'postgresql://fixture:unused@localhost/booksoul_auth_test?schema=test_auth';

  it('accepts an explicitly separate test database and schema', () => {
    expect(
      resolveIsolatedDatabaseUrl({
        DATABASE_URL: applicationUrl,
        TEST_DATABASE_URL: testUrl,
      }),
    ).toBe(testUrl);
  });

  it.each([
    {},
    { TEST_DATABASE_URL: testUrl },
    { DATABASE_URL: applicationUrl },
    { DATABASE_URL: applicationUrl, TEST_DATABASE_URL: 'invalid' },
    { DATABASE_URL: 'invalid', TEST_DATABASE_URL: testUrl },
    {
      DATABASE_URL: applicationUrl,
      TEST_DATABASE_URL: 'https://localhost/booksoul_test?schema=test_auth',
    },
    {
      DATABASE_URL: applicationUrl,
      TEST_DATABASE_URL: 'postgresql://localhost/booksoul?schema=test_auth',
    },
    {
      DATABASE_URL: applicationUrl,
      TEST_DATABASE_URL: 'postgresql://localhost/booksoul_test',
    },
    {
      DATABASE_URL: applicationUrl,
      TEST_DATABASE_URL: 'postgresql://localhost/booksoul_test?schema=public',
    },
    { DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl },
    {
      DATABASE_URL: testUrl,
      TEST_DATABASE_URL:
        'postgresql://fixture:other@LOCALHOST:5432/booksoul_auth_test?schema=test_auth',
    },
    {
      DATABASE_URL: testUrl,
      TEST_DATABASE_URL:
        'postgresql://localhost/booksoul_auth_test?schema=test_other',
    },
    {
      DATABASE_URL: applicationUrl,
      TEST_DATABASE_URL: 'postgresql:///booksoul_test?schema=test_auth',
    },
    {
      DATABASE_URL: applicationUrl,
      TEST_DATABASE_URL:
        'postgresql://localhost/booksoul_test?schema=test_auth&schema=public',
    },
  ])('rejects unproven isolation without exposing URLs: %p', (env) => {
    let message = '';
    try {
      resolveIsolatedDatabaseUrl(env);
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('postgresql://');
    expect(message).not.toContain('fixture:');
  });
});
