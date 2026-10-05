export interface ProfileMediaConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
}

export function parseProfileMediaConfig(
  config: Record<string, unknown>,
): ProfileMediaConfig | null {
  const value = (name: string): string => {
    const raw = config[name];
    if (raw === undefined || raw === null) return '';
    if (typeof raw !== 'string') throw new Error(`${name} must be a string`);
    return raw.trim();
  };
  const region = value('OSS_REGION');
  const bucket = value('OSS_BUCKET');
  const accessKeyId = value('OSS_ACCESS_KEY_ID');
  const accessKeySecret = value('OSS_ACCESS_KEY_SECRET');
  const rawEndpoint = value('OSS_ENDPOINT');
  if (
    ![region, bucket, accessKeyId, accessKeySecret, rawEndpoint].some(Boolean)
  ) {
    return null;
  }
  if (![region, bucket, accessKeyId, accessKeySecret].every(Boolean)) {
    throw new Error(
      'OSS configuration requires region, bucket and both access keys',
    );
  }
  if (!/^oss-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region)) {
    throw new Error('OSS_REGION must be an OSS region identifier');
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('OSS_BUCKET must be a valid bucket name');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(rawEndpoint || `https://${region}.aliyuncs.com`);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.port ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.pathname !== '/' ||
      ![`${region}.aliyuncs.com`, `${region}-internal.aliyuncs.com`].includes(
        endpoint.hostname,
      )
    )
      throw new Error();
  } catch {
    throw new Error(
      'OSS_ENDPOINT must be the trusted HTTPS OSS endpoint for OSS_REGION, without credentials, path, query or fragment',
    );
  }
  return {
    region,
    bucket,
    accessKeyId,
    accessKeySecret,
    endpoint: endpoint.origin,
  };
}
