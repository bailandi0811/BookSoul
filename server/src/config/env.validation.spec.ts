import { validateEnvironment } from './env.validation';

describe('validateEnvironment optional integrations', () => {
  it('accepts optional tarot configuration and refuses unsafe classifier bases', () => {
    const base = {
      DATABASE_URL: 'postgresql://localhost/booksoul',
      JWT_ACCESS_SECRET: 'a-private-test-secret-that-is-long-enough',
    };
    expect(() =>
      validateEnvironment({
        ...base,
        TYPESAFE_API_KEY: '',
        TYPESAFE_API_BASE: '',
      }),
    ).not.toThrow();
    expect(() =>
      validateEnvironment({
        ...base,
        TYPESAFE_API_BASE: 'https://api.typesafe.ai/',
      }),
    ).not.toThrow();
    for (const url of [
      'http://api.typesafe.ai',
      'https://user:pass@example.test',
      'https://example.test/path',
      'https://example.test/?key=private',
    ])
      expect(() =>
        validateEnvironment({ ...base, TYPESAFE_API_BASE: url }),
      ).toThrow('TYPESAFE_API_BASE');
  });
  const validBase = {
    DATABASE_URL: 'postgresql://localhost/booksoul',
    JWT_ACCESS_SECRET: 'a-private-test-secret-that-is-long-enough',
  };

  it('accepts decisions paths and refuses paths that can replace the host', () => {
    for (const path of ['/v1/systemone', '/api/v1/decisions', ''])
      expect(() =>
        validateEnvironment({ ...validBase, TYPESAFE_API_PATH: path }),
      ).not.toThrow();
    for (const path of [
      '//other.example.test/decisions',
      'https://other.example.test',
      '/v1/chat/completions',
      '/api/v1/decisions?key=secret',
    ])
      expect(() =>
        validateEnvironment({ ...validBase, TYPESAFE_API_PATH: path }),
      ).toThrow('TYPESAFE_API_PATH');
  });

  it('keeps email delivery optional', () => {
    expect(validateEnvironment({ ...validBase })).toEqual(validBase);
  });

  it('requires independent challenge keys while keeping blank examples optional', () => {
    expect(() =>
      validateEnvironment({ ...validBase, AUTH_CHALLENGE_SECRET: '' }),
    ).not.toThrow();
    expect(() =>
      validateEnvironment({ ...validBase, AUTH_CHALLENGE_SECRET: 'short' }),
    ).toThrow('AUTH_CHALLENGE_SECRET');
    expect(() =>
      validateEnvironment({
        ...validBase,
        JWT_ACCESS_SECRET: 'ab'.repeat(32),
        AUTH_CHALLENGE_SECRET: 'ab'.repeat(32),
      }),
    ).toThrow('AUTH_CHALLENGE_SECRET');
    expect(() =>
      validateEnvironment({
        ...validBase,
        AUTH_CHALLENGE_SECRET: 'ab'.repeat(32),
        AUTH_PUBLIC_BASE_URL: 'http://localhost:5173/app/',
      }),
    ).not.toThrow();
    expect(() =>
      validateEnvironment({
        ...validBase,
        NODE_ENV: 'production',
        AUTH_PUBLIC_BASE_URL: 'http://localhost:5173',
      }),
    ).toThrow('AUTH_PUBLIC_BASE_URL');
  });

  it('rejects invalid SMTP booleans', () => {
    expect(() =>
      validateEnvironment({ ...validBase, SMTP_SECURE: 'sometimes' }),
    ).toThrow('SMTP_SECURE must be true or false');
  });

  it.each(['SMTP_PORT', 'SMTP_CONNECTION_TIMEOUT_MS'])(
    'rejects a non-positive %s',
    (name) => {
      expect(() => validateEnvironment({ ...validBase, [name]: 0 })).toThrow(
        `${name} must be a positive number`,
      );
    },
  );

  it('accepts the allowlisted Tavily search tool and HTTPS endpoint', () => {
    const config = {
      ...validBase,
      TAVILY_MCP_URL: 'https://mcp.tavily.com/mcp',
      MCP_ALLOWED_TOOL_NAMES: 'tavily_search',
      MCP_TOOL_TIMEOUT_MS: 8_000,
    };
    expect(validateEnvironment(config)).toEqual(config);
  });

  it('rejects non-HTTPS MCP endpoints', () => {
    expect(() =>
      validateEnvironment({
        ...validBase,
        TAVILY_MCP_URL: 'http://example.com/mcp',
      }),
    ).toThrow('TAVILY_MCP_URL must be a valid HTTPS URL');
  });

  it('rejects MCP tools outside the external-search allowlist', () => {
    expect(() =>
      validateEnvironment({
        ...validBase,
        MCP_ALLOWED_TOOL_NAMES: 'tavily_search,tavily_extract',
      }),
    ).toThrow(
      'MCP_ALLOWED_TOOL_NAMES contains unsupported tool: tavily_extract',
    );
  });

  it('accepts Redis-backed Agent admission with a valid lease cadence', () => {
    const config = {
      ...validBase,
      AGENT_ADMISSION_MODE: 'redis',
      REDIS_URL: 'rediss://redis.internal:6380',
      AGENT_RUN_LEASE_TTL_MS: 120_000,
      AGENT_RUN_HEARTBEAT_MS: 30_000,
    };
    expect(validateEnvironment(config)).toEqual(config);
  });

  it('rejects Redis admission without a private Redis URL', () => {
    expect(() =>
      validateEnvironment({
        ...validBase,
        AGENT_ADMISSION_MODE: 'redis',
      }),
    ).toThrow('REDIS_URL must be a valid redis:// or rediss:// URL');
  });

  it('rejects an Agent heartbeat that cannot renew safely before expiry', () => {
    expect(() =>
      validateEnvironment({
        ...validBase,
        AGENT_RUN_LEASE_TTL_MS: 60_000,
        AGENT_RUN_HEARTBEAT_MS: 30_000,
      }),
    ).toThrow(
      'AGENT_RUN_HEARTBEAT_MS must be less than half of AGENT_RUN_LEASE_TTL_MS',
    );
  });
});
