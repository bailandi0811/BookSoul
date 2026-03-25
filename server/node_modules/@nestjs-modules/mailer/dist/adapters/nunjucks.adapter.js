"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NunjucksAdapter = void 0;
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("node:fs"));
const path = tslib_1.__importStar(require("node:path"));
const css_inline_1 = require("@css-inline/css-inline");
const lodash_1 = require("lodash");
class NunjucksAdapter {
    constructor(config) {
        this.precompiledTemplates = {};
        this.config = {
            inlineCssOptions: {},
            inlineCssEnabled: true,
        };
        Object.assign(this.config, config);
    }
    compile(mail, callback, mailerOptions) {
        const { context, template } = mail.data;
        const templateBaseDir = (0, lodash_1.get)(mailerOptions, 'template.dir', '');
        const templateExt = path.extname(template) || '.njk';
        let templateName = path.basename(template, path.extname(template));
        const templateDir = path.isAbsolute(template)
            ? path.dirname(template)
            : path.join(templateBaseDir, path.dirname(template));
        const templatePath = path.join(templateDir, templateName + templateExt);
        templateName = path
            .relative(templateBaseDir, templatePath)
            .replace(templateExt, '');
        if (!this.precompiledTemplates[templateName]) {
            try {
                let nunjucks;
                try {
                    nunjucks = require('nunjucks');
                }
                catch (_a) {
                    return callback(new Error('nunjucks is not installed. Install it with: npm install nunjucks'));
                }
                const templateContent = fs.readFileSync(templatePath, 'utf-8');
                const env = nunjucks.configure(templateDir, Object.assign({ autoescape: true }, (0, lodash_1.get)(mailerOptions, 'template.options', {})));
                const compiled = nunjucks.compile(templateContent, env);
                this.precompiledTemplates[templateName] = (ctx) => compiled.render(ctx);
            }
            catch (err) {
                return callback(err);
            }
        }
        const rendered = this.precompiledTemplates[templateName](context);
        if (this.config.inlineCssEnabled) {
            try {
                mail.data.html = (0, css_inline_1.inline)(rendered, this.config.inlineCssOptions);
            }
            catch (e) {
                return callback(e);
            }
        }
        else {
            mail.data.html = rendered;
        }
        return callback();
    }
}
exports.NunjucksAdapter = NunjucksAdapter;
