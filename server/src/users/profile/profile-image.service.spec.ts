import sharp from 'sharp';
import { ProfileImageService } from './profile-image.service';

describe('ProfileImageService', () => {
  const signal = () => new AbortController().signal;
  const image = (width = 8, height = 4) =>
    sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 20, g: 90, b: 140 },
      },
    });
  let service: ProfileImageService;

  beforeEach(() => {
    service = new ProfileImageService();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each(['jpeg', 'png', 'webp'] as const)(
    'decodes %s and produces a 512 square WebP avatar',
    async (format) => {
      const input = await image().toFormat(format).toBuffer();
      const result = await service.normalizeImage(input, 'AVATAR', signal());
      const metadata = await sharp(result.bytes).metadata();
      expect(result).toMatchObject({
        width: 512,
        height: 512,
        contentType: `image/${format}`,
      });
      expect(metadata).toMatchObject({
        format: 'webp',
        width: 512,
        height: 512,
      });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
    },
  );

  it('does not enlarge a small wallpaper', async () => {
    const result = await service.normalizeImage(
      await image().png().toBuffer(),
      'WALLPAPER',
      signal(),
    );
    expect(result).toMatchObject({
      width: 8,
      height: 4,
      contentType: 'image/png',
    });
    expect(await sharp(result.bytes).metadata()).toMatchObject({
      format: 'webp',
      width: 8,
      height: 4,
    });
  });

  it.each([
    [4800, 2400, 3840, 1920],
    [2400, 4800, 1920, 3840],
  ])(
    'limits a %sx%s wallpaper to %sx%s',
    async (width, height, expectedWidth, expectedHeight) => {
      const result = await service.normalizeImage(
        await image(width, height).png().toBuffer(),
        'WALLPAPER',
        signal(),
      );
      expect(result).toMatchObject({
        width: expectedWidth,
        height: expectedHeight,
      });
    },
  );

  it('applies EXIF orientation before resizing and strips private metadata', async () => {
    const input = await image(80, 40)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const result = await service.normalizeImage(input, 'WALLPAPER', signal());
    expect(result).toMatchObject({ width: 40, height: 80 });
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  it.each([
    Buffer.alloc(0),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
    ),
    Buffer.from('not an image'),
  ])('rejects empty, unknown and disallowed images', async (input) => {
    await expect(
      service.normalizeImage(input, 'AVATAR', signal()),
    ).rejects.toMatchObject({
      response: { code: 'MEDIA_INVALID_IMAGE' },
      status: 422,
    });
  });

  it('requires a full successful decode rather than metadata alone', async () => {
    const input = await image(100, 100).jpeg().toBuffer();
    const truncated = input.subarray(0, input.length - 20);
    await expect(
      service.normalizeImage(truncated, 'AVATAR', signal()),
    ).rejects.toMatchObject({ response: { code: 'MEDIA_INVALID_IMAGE' } });
  });

  it('rejects an animated WebP instead of selecting its first frame', async () => {
    const gif = Buffer.from(
      '47494638396101000100800000000000ffffff21f90400000000002c000000000100010000020244010021f90400000000002c00000000010001000002024c01003b',
      'hex',
    );
    const input = await sharp(gif, { animated: true }).webp().toBuffer();
    expect((await sharp(input).metadata()).pages).toBeGreaterThan(1);
    await expect(
      service.normalizeImage(input, 'AVATAR', signal()),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('rejects APNG animation even when the decoder exposes only one page', async () => {
    const input = await image().png().toBuffer();
    const animationChunk = Buffer.from(
      '000000086163544c0000000200000000717c11d3',
      'hex',
    );
    const animated = Buffer.concat([
      input.subarray(0, 33),
      animationChunk,
      input.subarray(33),
    ]);
    await expect(
      service.normalizeImage(animated, 'AVATAR', signal()),
    ).rejects.toMatchObject({ status: 422 });
  });

  it.each([
    { width: 8193, height: 1 },
    { width: 1, height: 8193 },
    { width: 6000, height: 4001 },
    { width: 0, height: 8 },
    { width: 8, height: 0 },
    { width: 8, height: 4, pages: 2 },
    { width: 8, height: 4, pages: 1, loop: 0, delay: [100] },
  ])('rejects invalid decoded dimensions or frames %j', async (invalid) => {
    const input = await image().png().toBuffer();
    jest.spyOn(sharp.prototype, 'metadata').mockResolvedValue({
      format: 'png',
      ...invalid,
    } as sharp.Metadata);
    await expect(
      service.normalizeImage(input, 'AVATAR', signal()),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('accepts the 24 million pixel and 8192 side boundaries', async () => {
    const input = await image().png().toBuffer();
    const metadata = jest.spyOn(sharp.prototype, 'metadata');
    metadata.mockResolvedValueOnce({
      format: 'png',
      width: 6000,
      height: 4000,
    } as sharp.Metadata);
    await expect(
      service.normalizeImage(input, 'AVATAR', signal()),
    ).resolves.toMatchObject({ width: 512 });
    metadata.mockResolvedValueOnce({
      format: 'png',
      width: 8192,
      height: 1,
    } as sharp.Metadata);
    await expect(
      service.normalizeImage(input, 'AVATAR', signal()),
    ).resolves.toMatchObject({ width: 512 });
  });

  it('rejects an already cancelled call without starting native processing', async () => {
    const controller = new AbortController();
    controller.abort();
    const metadata = jest.spyOn(sharp.prototype, 'metadata');
    await expect(
      service.normalizeImage(Buffer.from('x'), 'AVATAR', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(metadata).not.toHaveBeenCalled();
  });

  it('requests the native ten second timeout and WebP quality 85', async () => {
    const input = await image().png().toBuffer();
    const timeout = jest.spyOn(sharp.prototype, 'timeout');
    const webp = jest.spyOn(sharp.prototype, 'webp');
    await service.normalizeImage(input, 'AVATAR', signal());
    expect(timeout).toHaveBeenCalledWith({ seconds: 10 });
    expect(webp).toHaveBeenCalledWith({ quality: 85 });
  });

  it('shares two slots across instances and holds an aborted slot until native processing settles', async () => {
    const input = await image().png().toBuffer();
    const output = await image(512, 512)
      .webp()
      .toBuffer({ resolveWithObject: true });
    const pending = () => {
      let resolve!: (value: typeof output) => void;
      const promise = new Promise<typeof output>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    const first = pending();
    const second = pending();
    const toBuffer = jest.spyOn(sharp.prototype, 'toBuffer');
    toBuffer
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = new AbortController();
    const a = service.normalizeImage(input, 'AVATAR', controller.signal);
    const b = new ProfileImageService().normalizeImage(
      input,
      'AVATAR',
      signal(),
    );
    while (toBuffer.mock.calls.length < 2)
      await new Promise<void>((done) => setImmediate(done));
    controller.abort();
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    jest.useFakeTimers();
    const waiting = new ProfileImageService().normalizeImage(
      input,
      'AVATAR',
      signal(),
    );
    const assertion = expect(waiting).rejects.toMatchObject({
      response: { code: 'MEDIA_PROCESSING_BUSY' },
      status: 503,
    });
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(toBuffer).toHaveBeenCalledTimes(2);
    first.resolve(output);
    second.resolve(output);
    await b;
    jest.useRealTimers();
    await expect(
      service.normalizeImage(input, 'AVATAR', signal()),
    ).resolves.toMatchObject({ width: 512 });
  });

  it('cancels a queued call without later starting a transformation', async () => {
    const input = await image().png().toBuffer();
    let resolve!: (value: sharp.Metadata) => void;
    const blocked = new Promise<sharp.Metadata>((done) => {
      resolve = done;
    });
    const metadata = jest
      .spyOn(sharp.prototype, 'metadata')
      .mockReturnValueOnce(blocked)
      .mockReturnValueOnce(blocked);
    const a = service.normalizeImage(input, 'AVATAR', signal());
    const b = service.normalizeImage(input, 'AVATAR', signal());
    await Promise.resolve();
    const controller = new AbortController();
    const queued = service.normalizeImage(input, 'AVATAR', controller.signal);
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(metadata).toHaveBeenCalledTimes(2);
    resolve({ format: 'png', width: 8, height: 4 } as sharp.Metadata);
    await Promise.all([a, b]);
    expect(metadata).toHaveBeenCalledTimes(2);
  });

  it('bounds queued image buffers and admits queued work after a slot settles', async () => {
    const input = await image().png().toBuffer();
    let resolve!: (value: sharp.Metadata) => void;
    const blocked = new Promise<sharp.Metadata>((done) => {
      resolve = done;
    });
    const metadata = jest
      .spyOn(sharp.prototype, 'metadata')
      .mockReturnValueOnce(blocked)
      .mockReturnValueOnce(blocked);
    const a = service.normalizeImage(input, 'AVATAR', signal());
    const b = service.normalizeImage(input, 'AVATAR', signal());
    const c = service.normalizeImage(input, 'AVATAR', signal());
    const d = service.normalizeImage(input, 'AVATAR', signal());
    await expect(
      service.normalizeImage(input, 'AVATAR', signal()),
    ).rejects.toMatchObject({
      response: { code: 'MEDIA_PROCESSING_BUSY' },
      status: 503,
    });
    expect(metadata).toHaveBeenCalledTimes(2);
    resolve({ format: 'png', width: 8, height: 4 } as sharp.Metadata);
    await expect(Promise.all([a, b, c, d])).resolves.toHaveLength(4);
    expect(metadata).toHaveBeenCalledTimes(4);
  });
});
