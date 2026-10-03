interface DatabaseEnvironment {
  TEST_DATABASE_URL?: string;
  DATABASE_URL?: string;
}

interface DatabaseIdentity {
  host: string;
  port: string;
  database: string;
  schema: string;
}

function identity(raw: string | undefined, name: string): DatabaseIdentity {
  if (!raw?.trim()) {
    throw new Error(`Database tests require an explicit ${name}.`);
  }
  try {
    const url = new URL(raw.trim());
    const database = decodeURIComponent(url.pathname.slice(1));
    const schema = url.searchParams.get('schema') ?? 'public';
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !url.hostname ||
      !database ||
      database.includes('/') ||
      database.includes('\0') ||
      !schema ||
      url.searchParams.getAll('schema').length > 1 ||
      url.searchParams.has('host')
    ) {
      throw new Error('Invalid target');
    }
    return {
      host: url.hostname.toLowerCase(),
      port: url.port || '5432',
      database: database.toLowerCase(),
      schema: schema.toLowerCase(),
    };
  } catch {
    throw new Error(`${name} must identify an unambiguous PostgreSQL target.`);
  }
}

export function resolveIsolatedDatabaseUrl(env: DatabaseEnvironment): string {
  const test = identity(env.TEST_DATABASE_URL, 'TEST_DATABASE_URL');
  const application = identity(env.DATABASE_URL, 'DATABASE_URL');
  if (
    !test.database.endsWith('_test') ||
    !/^test_[a-z0-9_]+$/.test(test.schema)
  ) {
    throw new Error(
      'Database tests require an isolated *_test database and test_* schema.',
    );
  }
  const sameTarget =
    test.host === application.host &&
    test.port === application.port &&
    test.database === application.database &&
    test.schema === application.schema;
  // A second schema in the same application database is not an independent
  // test database. Also reject ambiguous hostname aliases with the same name.
  if (sameTarget || test.database === application.database) {
    throw new Error(
      'Refusing database tests against the application database.',
    );
  }
  return env.TEST_DATABASE_URL!.trim();
}
