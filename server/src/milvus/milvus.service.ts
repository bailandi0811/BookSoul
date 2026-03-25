import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient } from '@zilliz/milvus2-sdk-node';

@Injectable()
export class MilvusService implements OnModuleInit {
  private client: MilvusClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const address = this.configService.get<string>('milvus.address') || 'localhost:19530';
    const token = this.configService.get<string>('milvus.token') || 'root:Milvus';

    this.client = new MilvusClient({ address, token });
    console.log('Connecting to Milvus at', address);
    try {
      await this.client.connectPromise;
      console.log('Connected to Milvus successfully.');
    } catch (error) {
      console.error('Failed to connect to Milvus:', error);
    }
  }

  getClient(): MilvusClient {
    return this.client;
  }
}
