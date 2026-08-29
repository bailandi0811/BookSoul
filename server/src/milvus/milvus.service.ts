import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { withTimeout } from '../common/promise-timeout';

@Injectable()
export class MilvusService implements OnModuleInit {
  private client!: MilvusClient;
  private available = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const configuredAddress =
      this.configService.get<string>('milvus.address') || 'localhost:19530';
    const token =
      this.configService.get<string>('milvus.token') || 'root:Milvus';
    const timeoutMs =
      this.configService.get<number>('milvus.requestTimeoutMs') || 8_000;

    const endpoint = normalizeMilvusEndpoint(configuredAddress);
    this.client = new MilvusClient({
      address: endpoint.address,
      token,
      ssl: endpoint.ssl,
      timeout: timeoutMs,
    });
    console.log('Connecting to Milvus at', endpoint.address);
    try {
      await withTimeout(
        this.client.connectPromise,
        timeoutMs,
        'Milvus connect',
      );
      this.available = true;
      console.log('Connected to Milvus successfully.');
    } catch (error) {
      this.available = false;
      console.error('Failed to connect to Milvus:', error);
    }
  }

  getClient(): MilvusClient {
    return this.client;
  }

  isAvailable(): boolean {
    return this.available;
  }
}

export function normalizeMilvusEndpoint(address: string): {
  address: string;
  ssl: boolean;
} {
  const trimmed = address.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { address: trimmed, ssl: false };
  }

  const url = new URL(trimmed);
  const ssl = url.protocol === 'https:';
  const port = url.port || (ssl ? '443' : '19530');
  return {
    address: `${url.hostname}:${port}`,
    ssl,
  };
}
