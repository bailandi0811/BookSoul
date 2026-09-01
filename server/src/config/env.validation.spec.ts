import { validateEnvironment } from './env.validation';

describe('validateEnvironment optional integrations', () => {
  const validBase = {
    DATABASE_URL: 'postgresql://localhost/booksoul',
    JWT_ACCESS_SECRET: 'a-private-test-secret-that-is-long-enough',
  };

  it('keeps email delivery optional', () => {
    expect(validateEnvironment({ ...validBase })).toEqual(validBase);
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
