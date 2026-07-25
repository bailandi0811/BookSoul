import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown database error';
      // Never include DATABASE_URL / credentials in logs or thrown messages.
      this.logger.error(
        `Database connection failed. Check DATABASE_URL host/database settings. Detail: ${this.sanitizeError(message)}`,
      );
      throw new Error(
        'Failed to connect to the database. Verify DATABASE_URL without exposing credentials.',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private sanitizeError(message: string): string {
    return message
      .replace(/postgresql:\/\/[^\s'"]+/gi, 'postgresql://***')
      .replace(/password=\S+/gi, 'password=***')
      .replace(/:([^:@/]+)@/g, ':***@');
  }
}
