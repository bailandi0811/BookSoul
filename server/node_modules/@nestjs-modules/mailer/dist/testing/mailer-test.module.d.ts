import { DynamicModule } from '@nestjs/common';
export declare class MailerTestModule {
    static register(options?: Partial<{
        template: {
            dir?: string;
            adapter?: any;
            options?: any;
        };
    }>): DynamicModule;
}
