import { MailerEvent, MailerEventPayload } from './interfaces/mailer-events.interface';
export declare class MailerEventService {
    private readonly logger;
    private eventEmitter;
    constructor(eventEmitter?: any);
    emit(event: MailerEvent, payload: MailerEventPayload): void;
    isAvailable(): boolean;
}
