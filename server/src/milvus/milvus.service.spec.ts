import { normalizeMilvusEndpoint } from './milvus.service';

describe('normalizeMilvusEndpoint', () => {
  it('normalizes a secure cloud URL to the gRPC TLS endpoint', () => {
    expect(normalizeMilvusEndpoint('https://cluster.example.com')).toEqual({
      address: 'cluster.example.com:443',
      ssl: true,
    });
  });

  it('preserves an explicit local gRPC endpoint', () => {
    expect(normalizeMilvusEndpoint('127.0.0.1:19530')).toEqual({
      address: '127.0.0.1:19530',
      ssl: false,
    });
  });
});
