#!/usr/bin/env node
var commander = require('commander');
var fs = require('fs');
var process = require('process');
var index_js = require('./index.js');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var fs__default = /*#__PURE__*/_interopDefault(fs);
var process__default = /*#__PURE__*/_interopDefault(process);

commander.program.name('htmlnano').description('Minify HTML with htmlnano').argument('[input]', 'input file', '-').option('-o, --output <file>', 'output file', '-').option('-p, --preset <preset>', 'preset to use', 'safe').option('-c, --config <file>', 'path to config file').action(async (input, options)=>{
    const { preset, output } = options;
    if (!preset || !(preset in index_js.presets)) {
        const available = Object.keys(index_js.presets).join(', ');
        process__default.default.stderr.write(`Unknown preset: ${preset}. Available presets: ${available}\n`);
        process__default.default.exitCode = 1;
        return;
    }
    const html = fs__default.default.readFileSync(input && input !== '-' ? input : 0, 'utf8');
    const key = preset;
    const chosenPreset = index_js.presets[key];
    const htmlnanoOptions = {};
    if (options.config) {
        htmlnanoOptions.configPath = options.config;
    }
    const result = await index_js.process(html, htmlnanoOptions, chosenPreset);
    if (output && output !== '-') {
        fs__default.default.writeFileSync(output, result.html);
    } else {
        process__default.default.stdout.write(result.html);
    }
});
commander.program.parse();
