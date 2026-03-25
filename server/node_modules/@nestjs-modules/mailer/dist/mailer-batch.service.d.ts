import { BatchMailOptions, BatchResult } from './interfaces/batch-options.interface';
import { MailerOptions } from './interfaces/mailer-options.interface';
import { MailerService } from './mailer.service';
export declare class MailerBatchService {
    private readonly mailerService;
    private readonly mailerOptions?;
    private sendTimestamps;
    constructor(mailerService: MailerService, mailerOptions?: MailerOptions);
    sendBatch(options: BatchMailOptions): Promise<BatchResult>;
    private waitForRateLimit;
    private sendOne;
}
