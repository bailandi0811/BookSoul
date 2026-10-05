import { UnconfiguredProfileMediaStorage } from './unconfigured-profile-media.storage';

describe('UnconfiguredProfileMediaStorage', () => {
  it('reports uploads unavailable and every object operation fails explicitly', async () => {
    const storage = new UnconfiguredProfileMediaStorage();
    const signal = new AbortController().signal;
    expect(storage.configured).toBe(false);
    const operations = [
      () => storage.createUpload('key', 'image/png', 1, new Date()),
      () => storage.head('key'),
      () => storage.readBounded('key', 1, signal),
      () => storage.putPrivate('key', Buffer.from('x'), 'image/webp', signal),
      () => storage.signRead('key', 900),
      () => storage.delete('key'),
    ];
    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({
        response: { code: 'MEDIA_STORAGE_UNAVAILABLE' },
        status: 503,
      });
    }
  });
});
