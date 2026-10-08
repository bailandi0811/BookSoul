jest.mock('./app.module', () => ({ AppModule: class {} }));
jest.mock('./community/community.ws-adapter', () => ({
  CommunityWsAdapter: class {},
}));
jest.mock('./community/community.tickets.service', () => ({
  CommunityTicketsService: class {},
}));
jest.mock('@nestjs/core', () => ({ NestFactory: { create: jest.fn() } }));

describe('bootstrap deployment boundaries', () => {
  const originalMode = process.env.NODE_ENV;
  const originalOrigins = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
    if (originalOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = originalOrigins;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  async function start(mode: string) {
    process.env.NODE_ENV = mode;
    process.env.CORS_ORIGINS = 'https://reader.example';
    const set = jest.fn();
    const tickets = { setAllowedOrigins: jest.fn() };
    const drain = { middleware: jest.fn(), isDraining: false };
    const app = {
      enableShutdownHooks: jest.fn(),
      get: jest.fn().mockReturnValueOnce(drain).mockReturnValue(tickets),
      getHttpServer: jest.fn(() => ({})),
      getHttpAdapter: jest.fn(() => ({ getInstance: () => ({ set }) })),
      useWebSocketAdapter: jest.fn(),
      use: jest.fn(),
      enableCors: jest.fn(),
      useGlobalPipes: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    const { NestFactory } = jest.requireMock<{
      NestFactory: { create: jest.Mock };
    }>('@nestjs/core');
    NestFactory.create.mockResolvedValue(app);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.requireActual('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { app, set, tickets };
  }

  it('enables SIGTERM/SIGINT hooks and keeps the production proxy boundary at one hop', async () => {
    const { app, set, tickets } = await start('production');
    expect(app.enableShutdownHooks).toHaveBeenCalledWith(['SIGTERM', 'SIGINT']);
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
    expect(app.listen).toHaveBeenCalledWith(process.env.PORT || 3000);
    expect(tickets.setAllowedOrigins).toHaveBeenCalledWith(
      new Set(['https://reader.example']),
    );
  });

  it('does not trust forwarded IPs in local development', async () => {
    const { app, set } = await start('development');
    expect(set).not.toHaveBeenCalled();
    expect(app.listen).toHaveBeenCalledTimes(1);
  });
});
