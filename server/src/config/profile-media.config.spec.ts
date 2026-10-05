import { parseProfileMediaConfig } from './profile-media.config';

describe('parseProfileMediaConfig', () => {
  const complete = {
    OSS_REGION: 'oss-cn-hangzhou',
    OSS_BUCKET: 'profile-test-bucket',
    OSS_ACCESS_KEY_ID: 'test-key-id',
    OSS_ACCESS_KEY_SECRET: 'test-key-secret',
  };

  it('allows absent or blank OSS configuration without reading environment files', () => {
    expect(parseProfileMediaConfig({})).toBeNull();
    expect(parseProfileMediaConfig({ OSS_BUCKET: '  ' })).toBeNull();
  });

  it('returns a complete configuration and a trusted HTTPS endpoint', () => {
    expect(parseProfileMediaConfig(complete)).toEqual({
      region: 'oss-cn-hangzhou',
      bucket: 'profile-test-bucket',
      accessKeyId: 'test-key-id',
      accessKeySecret: 'test-key-secret',
      endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    });
    expect(
      parseProfileMediaConfig({
        ...complete,
        OSS_ENDPOINT: 'https://oss-cn-hangzhou-internal.aliyuncs.com/',
      }),
    ).toHaveProperty(
      'endpoint',
      'https://oss-cn-hangzhou-internal.aliyuncs.com',
    );
  });

  it.each(Object.keys(complete))(
    'rejects partial configuration missing %s',
    (field) => {
      expect(() =>
        parseProfileMediaConfig({ ...complete, [field]: '' }),
      ).toThrow('OSS');
    },
  );

  it('rejects an endpoint on its own', () => {
    expect(() =>
      parseProfileMediaConfig({
        OSS_ENDPOINT: 'https://oss-cn-hangzhou.aliyuncs.com',
      }),
    ).toThrow('OSS');
  });

  it.each([
    'http://oss-cn-hangzhou.aliyuncs.com',
    'https://oss-cn-hangzhou.aliyuncs.com.evil.test',
    'https://evil.test',
    'https://127.0.0.1',
    'https://oss-cn-hangzhou.aliyuncs.com:8443',
    'https://user:pass@oss-cn-hangzhou.aliyuncs.com',
    'https://oss-cn-hangzhou.aliyuncs.com/path',
    'https://oss-cn-hangzhou.aliyuncs.com?redirect=1',
    'https://oss-cn-hangzhou.aliyuncs.com#fragment',
    'https://oss-cn-beijing.aliyuncs.com',
    'https://ecs-cn-hangzhou.aliyuncs.com',
  ])('rejects untrusted endpoint %s', (endpoint) => {
    expect(() =>
      parseProfileMediaConfig({ ...complete, OSS_ENDPOINT: endpoint }),
    ).toThrow('OSS_ENDPOINT');
  });

  it.each([
    { OSS_REGION: 'cn-hangzhou' },
    { OSS_REGION: 'oss-../../secret' },
    { OSS_BUCKET: 'Bucket.With.Dots' },
    { OSS_BUCKET: '-invalid' },
    { OSS_ACCESS_KEY_ID: 123 },
  ])(
    'rejects malformed configuration without disclosing credentials',
    (change) => {
      expect(() => parseProfileMediaConfig({ ...complete, ...change })).toThrow(
        'OSS',
      );
      try {
        parseProfileMediaConfig({ ...complete, ...change });
      } catch (error) {
        expect(String(error)).not.toContain('test-key-secret');
      }
    },
  );
});
