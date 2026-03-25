"use strict";
var MailerQueueProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerQueueProcessor = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const mailer_constant_1 = require("./constants/mailer.constant");
const mailer_events_interface_1 = require("./interfaces/mailer-events.interface");
const mailer_service_1 = require("./mailer.service");
const mailer_event_service_1 = require("./mailer-event.service");
let MailerQueueProcessor = MailerQueueProcessor_1 = class MailerQueueProcessor {
    constructor(mailerService, options, eventService) {
        this.mailerService = mailerService;
        this.options = options;
        this.eventService = eventService;
        this.logger = new common_1.Logger(MailerQueueProcessor_1.name);
    }
    onModuleInit() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                const bullmq = require('bullmq');
                const queueName = this.options.queueName || 'mailer';
                this.worker = new bullmq.Worker(queueName, (job) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    return this.processJob(job);
                }), {
                    connection: this.options.connection,
                    concurrency: 5,
                });
                this.worker.on('failed', (job, error) => {
                    var _a;
                    this.logger.error(`Email job ${job === null || job === void 0 ? void 0 : job.id} failed: ${error.message}`);
                    (_a = this.eventService) === null || _a === void 0 ? void 0 : _a.emit(mailer_events_interface_1.MailerEvent.QUEUE_FAILED, {
                        mailOptions: job === null || job === void 0 ? void 0 : job.data,
                        error,
                        timestamp: new Date(),
                    });
                });
                this.worker.on('completed', (job, result) => {
                    var _a;
                    (_a = this.eventService) === null || _a === void 0 ? void 0 : _a.emit(mailer_events_interface_1.MailerEvent.QUEUE_COMPLETED, {
                        mailOptions: job === null || job === void 0 ? void 0 : job.data,
                        result,
                        timestamp: new Date(),
                    });
                });
                this.logger.log(`Mailer queue worker "${queueName}" started`);
            }
            catch (_a) {
                this.logger.warn('bullmq is not installed. Queue processor will not start.');
            }
        });
    }
    processJob(job) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const mailOptions = job.data;
            this.logger.debug(`Processing email job ${job.id}`);
            return this.mailerService.sendMail(mailOptions);
        });
    }
};
exports.MailerQueueProcessor = MailerQueueProcessor;
exports.MailerQueueProcessor = MailerQueueProcessor = MailerQueueProcessor_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(1, (0, common_1.Inject)(mailer_constant_1.MAILER_QUEUE_OPTIONS)),
    tslib_1.__param(2, (0, common_1.Optional)()),
    tslib_1.__metadata("design:paramtypes", [mailer_service_1.MailerService, Object, mailer_event_service_1.MailerEventService])
], MailerQueueProcessor);
