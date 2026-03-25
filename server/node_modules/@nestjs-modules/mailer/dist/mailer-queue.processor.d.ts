import { OnModuleInit } from '@nestjs/common';
import { MailerQueueOptions } from './interfaces/queue-options.interface';
import { MailerService } from './mailer.service';
import { MailerEventService } from './mailer-event.service';
export declare class MailerQueueProcessor implements OnModuleInit {
    private readonly mailerService;
    private readonly options;
    private readonly eventService?;
    private readonly logger;
    private worker;
    constructor(mailerService: MailerService, options: MailerQueueOptions, eventService?: MailerEventService);
    onModuleInit(): Promise<void>;
    private processJob;
}
