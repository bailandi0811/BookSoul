import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
@Injectable()
export class AuthMailDispatcher implements OnApplicationShutdown {
  private readonly logger = new Logger(AuthMailDispatcher.name);
  private readonly queued: (() => Promise<void>)[] = [];
  private readonly running = new Set<Promise<void>>();
  private stopping = false;
  assertCapacity(): void {
    if (this.stopping || this.running.size + this.queued.length >= 100)
      throw new ServiceUnavailableException({
        code: 'AUTH_MAIL_UNAVAILABLE',
        message: '邮件服务繁忙，请稍后重试',
      });
  }
  enqueue(job: () => Promise<void>): void {
    this.assertCapacity();
    this.queued.push(job);
    this.pump();
  }
  private pump(): void {
    while (!this.stopping && this.running.size < 2 && this.queued.length) {
      const job = this.queued.shift()!;
      const pending = Promise.resolve()
        .then(job)
        .catch(() => {
          this.logger.error('AUTH_MAIL_DELIVERY_FAILED');
        })
        .finally(() => {
          this.running.delete(pending);
          this.pump();
        });
      this.running.add(pending);
    }
  }
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.queued.length = 0;
    await Promise.all([...this.running]);
  }
}
