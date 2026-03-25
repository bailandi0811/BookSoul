"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _path = _interopRequireDefault(require("path"));
var _yargs = _interopRequireDefault(require("yargs"));
var _fp = require("lodash/fp");
var _lodash = require("lodash");
var _mjmlCore = _interopRequireWildcard(require("mjml-core"));
var _mjmlValidator = _interopRequireWildcard(require("mjml-validator"));
var _mjmlPresetCore = _interopRequireDefault(require("mjml-preset-core"));
var _mjmlParserXml = _interopRequireDefault(require("mjml-parser-xml"));
var _package = require("mjml-core/package.json");
var _readFile = _interopRequireWildcard(require("./commands/readFile"));
var _watchFiles = _interopRequireDefault(require("./commands/watchFiles"));
var _readStream = _interopRequireDefault(require("./commands/readStream"));
var _outputToFile = _interopRequireWildcard(require("./commands/outputToFile"));
var _outputToConsole = _interopRequireDefault(require("./commands/outputToConsole"));
var _package2 = require("../package.json");
var _defaultOptions = _interopRequireDefault(require("./helpers/defaultOptions"));
const beautifyConfig = {
  indent_size: 2,
  wrap_attributes_indent_size: 2,
  max_preserve_newline: 0,
  preserve_newlines: false,
  end_with_newline: true
};
const minifyConfig = {
  collapseWhitespace: true,
  minifyCss: false,
  caseSensitive: true,
  removeEmptyAttributes: true
};
var _default = async () => {
  let EXIT_CODE = 0;
  let KEEP_OPEN = false;
  const error = msg => {
    console.error('\nCommand line error:'); // eslint-disable-line no-console
    console.error(msg); // eslint-disable-line no-console

    process.exit(1);
  };
  const pickArgs = args => (0, _fp.flow)((0, _fp.pick)(args), (0, _fp.pickBy)(e => (0, _fp.negate)(_fp.isNil)(e) && !((0, _lodash.isArray)(e) && (0, _lodash.isEmpty)(e))));
  const {
    argv
  } = _yargs.default.version(false) // cf. https://github.com/yargs/yargs/issues/961
  .options({
    r: {
      alias: 'read',
      describe: 'Compile MJML File(s)',
      type: 'array'
    },
    v: {
      alias: 'validate',
      describe: 'Run validator on File(s)',
      type: 'array'
    },
    w: {
      alias: 'watch',
      type: 'array',
      describe: 'Watch and compile MJML File(s) when modified'
    },
    i: {
      alias: 'stdin',
      describe: 'Compiles MJML from input stream'
    },
    s: {
      alias: 'stdout',
      type: 'boolean',
      describe: 'Output HTML to stdout'
    },
    o: {
      alias: 'output',
      type: 'string',
      describe: 'Filename/Directory to output compiled files'
    },
    c: {
      alias: 'config',
      type: 'object',
      describe: 'Option to pass to mjml-core'
    },
    sanitizeStyles: {
      type: 'boolean',
      describe: 'Sanitize template variables inside CSS before minification'
    },
    version: {
      alias: 'V'
    },
    noStdoutFileComment: {
      type: 'boolean',
      describe: 'Add no file comment to stdout'
    }
  }).help().version(`mjml-core: ${_package.version}\nmjml-cli: ${_package2.version}`);
  let juiceOptions;
  let minifyOptions;
  let juicePreserveTags;
  let fonts;
  let templateSyntax;
  let includePath;
  try {
    juiceOptions = argv.c && argv.c.juiceOptions && JSON.parse(argv.c.juiceOptions);
  } catch (e) {
    error(`Failed to decode JSON for config.juiceOptions argument`);
  }
  try {
    minifyOptions = argv.c && argv.c.minifyOptions && JSON.parse(argv.c.minifyOptions);
  } catch (e) {
    error(`Failed to decode JSON for config.minifyOptions argument`);
  }
  try {
    juicePreserveTags = argv.c && argv.c.juicePreserveTags && JSON.parse(argv.c.juicePreserveTags);
  } catch (e) {
    error(`Failed to decode JSON for config.juicePreserveTags argument`);
  }
  try {
    fonts = argv.c && argv.c.fonts && JSON.parse(argv.c.fonts);
  } catch (e) {
    error(`Failed to decode JSON for config.fonts argument`);
  }
  try {
    templateSyntax = argv.c && argv.c.templateSyntax && JSON.parse(argv.c.templateSyntax);
  } catch (e) {
    error(`Failed to decode JSON for config.templateSyntax argument`);
  }

  // Support includePath as string or JSON array in CLI
  includePath = argv.c && argv.c.includePath;
  if (typeof includePath === 'string') {
    try {
      includePath = JSON.parse(includePath);
    } catch (_) {
      // keep as string when not JSON
    }
  }
  const filePath = argv.c && argv.c.filePath;
  const config = Object.assign(_defaultOptions.default, argv.c, fonts && {
    fonts
  }, minifyOptions && {
    minifyOptions
  }, juiceOptions && {
    juiceOptions
  }, juicePreserveTags && {
    juicePreserveTags
  }, templateSyntax && {
    templateSyntax
  }, typeof includePath !== 'undefined' && {
    includePath
  }, argv.c && argv.c.keepComments === 'false' && {
    keepComments: false
  });
  const configAllowIncludes = argv.c && (argv.c.allowIncludes === true || argv.c.allowIncludes === 'true');
  if (configAllowIncludes) {
    config.ignoreIncludes = false;
  }
  if (typeof config.sanitizeStyles === 'string') {
    config.sanitizeStyles = config.sanitizeStyles === 'true';
  }
  if (typeof config.minify === 'string') {
    config.minify = config.minify === 'true';
  }
  if (typeof argv.sanitizeStyles !== 'undefined') {
    config.sanitizeStyles = argv.sanitizeStyles;
  }
  const inputArgs = pickArgs(['r', 'w', 'i', '_', 'm', 'v'])(argv);
  const outputArgs = pickArgs(['o', 's'])(argv);
  (0, _mjmlCore.assignComponents)(_mjmlCore.components, _mjmlPresetCore.default.components);
  (0, _mjmlValidator.assignDependencies)(_mjmlValidator.dependencies, _mjmlPresetCore.default.dependencies)

  // implies (until yargs pr is accepted)
  ;
  [[Object.keys(inputArgs).length === 0, 'No input argument received'], [Object.keys(inputArgs).length > 1, 'Too many input arguments received'], [Object.keys(outputArgs).length > 1, 'Too many output arguments received'], [argv.w && argv.w.length > 1 && !argv.o, 'Need an output option when watching files'], [argv.w && argv.w.length > 1 && argv.o && !(0, _outputToFile.isDirectory)(argv.o) && argv.o !== '', 'Need an output option when watching files']].forEach(v => v[0] ? error(v[1]) : null);
  const inputOpt = Object.keys(inputArgs)[0];
  const outputOpt = Object.keys(outputArgs)[0] || 's';
  const inputFiles = (0, _lodash.isArray)(inputArgs[inputOpt]) ? inputArgs[inputOpt] : [inputArgs[inputOpt]];
  const inputs = [];
  switch (inputOpt) {
    case 'r':
    case 'v':
    case 'm':
    case '_':
      {
        (0, _readFile.flatMapPaths)(inputFiles).forEach(file => {
          inputs.push((0, _readFile.default)(file));
        });
        if (!inputs.length) {
          error('No input files found');
          return;
        }
        break;
      }
    case 'w':
      (0, _watchFiles.default)(inputFiles, {
        ...argv,
        config,
        minifyConfig,
        beautifyConfig
      });
      KEEP_OPEN = true;
      break;
    case 'i':
      inputs.push(await (0, _readStream.default)());
      break;
    default:
      error('Command line error: Incorrect input options');
  }
  const convertedStream = [];
  const failedStream = [];

  // eslint-disable-next-line guard-for-in
  for (const i of inputs) {
    try {
      let compiled;
      switch (inputOpt) {
        case 'v':
          // eslint-disable-next-line no-case-declarations
          const mjmlJson = (0, _mjmlParserXml.default)(i.mjml, {
            components: _mjmlCore.components,
            filePath: filePath || i.file,
            actualPath: i.file
          });
          compiled = {
            errors: (0, _mjmlValidator.default)(mjmlJson, {
              dependencies: _mjmlValidator.dependencies,
              components: _mjmlCore.components,
              initializeType: _mjmlCore.initializeType
            })
          };
          break;
        default:
          {
            var _config$useMjmlConfig;
            const beautify = config.beautify && config.beautify !== 'false';
            const minify = config.minify && config.minify !== 'false';

            // eslint-disable-next-line no-await-in-loop
            compiled = await (0, _mjmlCore.default)(i.mjml, {
              ...config,
              minify,
              beautify,
              beautifyConfig,
              minifyConfig,
              useMjmlConfigOptions: (_config$useMjmlConfig = config === null || config === void 0 ? void 0 : config.useMjmlConfigOptions) !== null && _config$useMjmlConfig !== void 0 ? _config$useMjmlConfig : false,
              filePath: filePath || i.file,
              actualPath: i.file
            });
          }
      }
      convertedStream.push({
        ...i,
        compiled
      });
    } catch (e) {
      EXIT_CODE = 2;
      failedStream.push({
        file: i.file,
        error: e
      });
    }
  }
  convertedStream.forEach(s => {
    if ((0, _lodash.get)(s, 'compiled.errors.length')) {
      console.error((0, _lodash.map)(s.compiled.errors, 'formattedMessage').join('\n')); // eslint-disable-line no-console
    }
  });
  failedStream.forEach(({
    error,
    file
  }) => {
    console.error(`${file ? `File: ${file}\n` : null}${error}`); // eslint-disable-line no-console

    if (config.stack) {
      console.error(error.stack); // eslint-disable-line no-console
    }
  });
  if (inputOpt === 'v') {
    const isInvalid = failedStream.length || convertedStream.some(s => !!(0, _lodash.get)(s, 'compiled.errors.length'));
    if (isInvalid) {
      error('Validation failed');
      return;
    }
    process.exitCode = 0;
    return;
  }
  if (!KEEP_OPEN && convertedStream.length === 0) {
    error('Input file(s) failed to render');
  }
  switch (outputOpt) {
    case 'o':
      {
        if (inputs.length > 1 && !(0, _outputToFile.isDirectory)(argv.o) && argv.o !== '') {
          error(`Multiple input files, but output option should be either an existing directory or an empty string: ${argv.o} given`);
        }
        const fullOutputPath = _path.default.parse(_path.default.resolve(process.cwd(), argv.o));
        if (inputs.length === 1 && !(0, _outputToFile.isDirectory)(fullOutputPath.dir)) {
          error(`Output directory doesn’t exist for path : ${argv.o}`);
        }
        Promise.all(convertedStream.map((0, _outputToFile.default)(argv.o))).then(() => {
          if (!KEEP_OPEN) {
            process.exitCode = EXIT_CODE;
          }
        }).catch(({
          outputName,
          err
        }) => {
          if (!KEEP_OPEN) {
            error(`Error writing file - ${outputName} : ${err}`);
          }
        });
        break;
      }
    case 's':
      {
        const addFileHeaderComment = !argv.noStdoutFileComment;
        Promise.all(convertedStream.map(converted => (0, _outputToConsole.default)(converted, addFileHeaderComment))).then(() => process.exitCode = EXIT_CODE) // eslint-disable-line no-return-assign
        .catch(() => process.exitCode = 1); // eslint-disable-line no-return-assign
        break;
      }
    default:
      error('Command line error: No output option available');
  }
};
exports.default = _default;
module.exports = exports.default;