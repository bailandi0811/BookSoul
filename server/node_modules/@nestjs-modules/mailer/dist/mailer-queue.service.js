"use strict";
var MailerQueueService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerQueueService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const mailer_constant_1 = require("./constants/mailer.constant");
const mailer_events_interface_1 = require("./interfaces/mailer-events.interface");
const mailer_event_service_1 = require("./mailer-event.service");
let MailerQueueService = MailerQueueService_1 = class MailerQueueService {
    constructor(options, eventService) {
        this.options = options;
        this.eventService = eventService;
        this.logger = new common_1.Logger(MailerQueueService_1.name);
    }
    onModuleInit() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                const bullmq = require('bullmq');
                this.Queue = bullmq.Queue;
                const queueName = this.options.queueName || 'mailer';
                this.queue = new this.Queue(queueName, {
                    connection: this.options.connection,
                    defaultJobOptions: this.options.defaultJobOptions || {
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 1000 },
                        removeOnComplete: 100,
                        removeOnFail: 500,
                    },
                });
                this.logger.log(`Mailer queue "${queueName}" initialized`);
            }
            catch (_a) {
                this.logger.error('bullmq is not installed. Install it with: pnpm add bullmq');
            }
        });
    }
    onModuleDestroy() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this.queue) {
                yield this.queue.close();
            }
        });
    }
    enqueue(mailOptions, jobOptions) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.queue) {
                throw new Error('Mailer queue is not initialized. Is bullmq installed?');
            }
            const job = yield this.queue.add('send-email', mailOptions, jobOptions);
            (_a = this.eventService) === null || _a === void 0 ? void 0 : _a.emit(mailer_events_interface_1.MailerEvent.QUEUED, {
                mailOptions,
                timestamp: new Date(),
            });
            return job;
        });
    }
    enqueueBatch(messages, jobOptions) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.queue) {
                throw new Error('Mailer queue is not initialized. Is bullmq installed?');
            }
            const jobs = yield this.queue.addBulk(messages.map((data) => ({
                name: 'send-email',
                data,
                opts: jobOptions,
            })));
            for (const msg of messages) {
                (_a = this.eventService) === null || _a === void 0 ? void 0 : _a.emit(mailer_events_interface_1.MailerEvent.QUEUED, {
                    mailOptions: msg,
                    timestamp: new Date(),
                });
            }
            return jobs;
        });
    }
    getMetrics() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this.queue) {
                throw new Error('Mailer queue is not initialized.');
            }
            const [waiting, active, completed, failed, delayed] = yield Promise.all([
                this.queue.getWaitingCount(),
                this.queue.getActiveCount(),
                this.queue.getCompletedCount(),
                this.queue.getFailedCount(),
                this.queue.getDelayedCount(),
            ]);
            return { waiting, active, completed, failed, delayed };
        });
    }
};
exports.MailerQueueService = MailerQueueService;
exports.MailerQueueService = MailerQueueService = MailerQueueService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(0, (0, common_1.Inject)(mailer_constant_1.MAILER_QUEUE_OPTIONS)),
    tslib_1.__param(1, (0, common_1.Optional)()),
    tslib_1.__metadata("design:paramtypes", [Object, mailer_event_service_1.MailerEventService])
], MailerQueueService);
