import { MailerService } from '../mailer.service';
import { MailerQueueService } from '../mailer-queue.service';
export declare class MailerHealthIndicator {
    private readonly mailerService;
    private readonly queueService?;
    constructor(mailerService: MailerService, queueService?: MailerQueueService);
    isHealthy(key?: string): Promise<Record<string, any>>;
}
