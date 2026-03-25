"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerHealthIndicator = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const mailer_service_1 = require("../mailer.service");
const mailer_queue_service_1 = require("../mailer-queue.service");
let MailerHealthIndicator = class MailerHealthIndicator {
    constructor(mailerService, queueService) {
        this.mailerService = mailerService;
        this.queueService = queueService;
    }
    isHealthy() {
        return tslib_1.__awaiter(this, arguments, void 0, function* (key = 'mailer') {
            const details = {};
            try {
                const transportersHealthy = yield this.mailerService.verifyAllTransporters();
                details.transporters = transportersHealthy ? 'up' : 'down';
            }
            catch (error) {
                details.transporters = 'down';
                details.error = error.message;
            }
            if (this.queueService) {
                try {
                    const metrics = yield this.queueService.getMetrics();
                    details.queue = Object.assign({ status: 'up' }, metrics);
                }
                catch (_a) {
                    details.queue = { status: 'down' };
                }
            }
            const isHealthy = details.transporters === 'up';
            return {
                [key]: Object.assign({ status: isHealthy ? 'up' : 'down' }, details),
            };
        });
    }
};
exports.MailerHealthIndicator = MailerHealthIndicator;
exports.MailerHealthIndicator = MailerHealthIndicator = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(1, (0, common_1.Optional)()),
    tslib_1.__metadata("design:paramtypes", [mailer_service_1.MailerService,
        mailer_queue_service_1.MailerQueueService])
], MailerHealthIndicator);
