"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerBatchService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const mailer_constant_1 = require("./constants/mailer.constant");
const mailer_service_1 = require("./mailer.service");
let MailerBatchService = class MailerBatchService {
    constructor(mailerService, mailerOptions) {
        this.mailerService = mailerService;
        this.mailerOptions = mailerOptions;
        this.sendTimestamps = [];
    }
    sendBatch(options) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const { messages, concurrency = 5, stopOnError = false } = options;
            const results = [];
            let sent = 0;
            let failed = 0;
            const executing = new Set();
            for (let i = 0; i < messages.length; i++) {
                if (stopOnError && failed > 0) {
                    results.push({
                        index: i,
                        success: false,
                        error: new Error('Batch stopped due to previous error'),
                    });
                    failed++;
                    continue;
                }
                yield this.waitForRateLimit();
                const task = this.sendOne(messages[i], i).then((result) => {
                    results.push(result);
                    if (result.success) {
                        sent++;
                    }
                    else {
                        failed++;
                    }
                });
                const wrappedTask = task.then(() => {
                    executing.delete(wrappedTask);
                });
                executing.add(wrappedTask);
                if (executing.size >= concurrency) {
                    yield Promise.race(executing);
                }
            }
            yield Promise.all(executing);
            results.sort((a, b) => a.index - b.index);
            return {
                total: messages.length,
                sent,
                failed,
                results,
            };
        });
    }
    waitForRateLimit() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            var _a;
            const rateLimit = (_a = this.mailerOptions) === null || _a === void 0 ? void 0 : _a.rateLimit;
            if (!rateLimit)
                return;
            const period = rateLimit.period || 1000;
            const now = Date.now();
            this.sendTimestamps = this.sendTimestamps.filter((t) => now - t < period);
            if (this.sendTimestamps.length >= rateLimit.maxMessages) {
                const oldestInWindow = this.sendTimestamps[0];
                const waitTime = period - (now - oldestInWindow);
                if (waitTime > 0) {
                    yield new Promise((resolve) => setTimeout(resolve, waitTime));
                }
                const newNow = Date.now();
                this.sendTimestamps = this.sendTimestamps.filter((t) => newNow - t < period);
            }
            this.sendTimestamps.push(Date.now());
        });
    }
    sendOne(mailOptions, index) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.mailerService.sendMail(mailOptions);
                return { index, success: true, result };
            }
            catch (error) {
                return { index, success: false, error: error };
            }
        });
    }
};
exports.MailerBatchService = MailerBatchService;
exports.MailerBatchService = MailerBatchService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(1, (0, common_1.Optional)()),
    tslib_1.__param(1, (0, common_1.Inject)(mailer_constant_1.MAILER_OPTIONS)),
    tslib_1.__metadata("design:paramtypes", [mailer_service_1.MailerService, Object])
], MailerBatchService);
