import { DynamicModule } from '@nestjs/common';
import { MailerQueueOptions } from './interfaces/queue-options.interface';
export declare class MailerQueueModule {
    static register(options: MailerQueueOptions): DynamicModule;
    static registerAsync(options: {
        imports?: any[];
        inject?: any[];
        useFactory: (...args: any[]) => Promise<MailerQueueOptions> | MailerQueueOptions;
    }): DynamicModule;
}
