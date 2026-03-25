"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _chokidar = _interopRequireDefault(require("chokidar"));
var _glob = require("glob");
var _minimatch = require("minimatch");
var _path = _interopRequireDefault(require("path"));
var _mjmlCore = _interopRequireDefault(require("mjml-core"));
var _fp = require("lodash/fp");
var _readFile = _interopRequireDefault(require("./readFile"));
var _outputToFile = _interopRequireDefault(require("./outputToFile"));
var _fileContext = _interopRequireDefault(require("../helpers/fileContext"));
/* eslint-disable no-console */

let dirty = [];
const _flatMap = _fp.flatMap.convert({
  cap: false
}); // eslint-disable-line no-underscore-dangle
const flatMapAndJoin = _flatMap((v, k) => v.map(p => _path.default.join(k, p)));
const flatMapKeyAndValues = (0, _fp.flow)(_flatMap((v, k) => [k, ...v]), _fp.uniq);
var _default = (input, options) => {
  const dependencies = {};
  const outputToFile = (0, _outputToFile.default)(options.o);
  const getRelatedFiles = file => (0, _fp.flow)((0, _fp.pickBy)((v, k) => k === file || v.indexOf(file) !== -1), Object.keys)(dependencies);
  const synchronyzeWatcher = filePath => {
    getRelatedFiles(filePath).forEach(f => {
      dependencies[f] = (0, _fileContext.default)(f, options.config.filePath);
      if (dirty.indexOf(f) === -1) {
        dirty.push(f);
      }
    });

    /* eslint-disable no-use-before-define */
    const files = {
      toWatch: flatMapKeyAndValues(dependencies),
      watched: flatMapAndJoin(watcher.getWatched())
    };
    watcher.add((0, _fp.difference)(files.toWatch, files.watched));
    watcher.unwatch((0, _fp.difference)(files.watched, files.toWatch));
    /* eslint-enable no-use-before-define */
  };
  const readAndCompile = (0, _fp.flow)(file => ({
    file,
    content: (0, _readFile.default)(file).mjml
  }), async args => {
    const {
      config
    } = options;
    const beautify = config.beautify && config.beautify !== 'false';
    const minify = config.minify && config.minify !== 'false';
    const compiled = await (0, _mjmlCore.default)(args.content, {
      ...config,
      beautify,
      minify,
      filePath: args.file,
      actualPath: args.file
    });
    return {
      ...args,
      compiled
    };
  }, args => {
    const {
      compiled: {
        errors
      }
    } = args;
    errors.forEach(e => console.warn(e.formattedMessage));
    return args;
  }, args => outputToFile(args).then(() => console.log(`${args.file} - Successfully compiled`)).catch(() => console.log(`${args.file} - Error while compiling file`)));
  const watcher = _chokidar.default.watch(input.map(i => i.replace(/\\/g, '/'))).on('change', file => synchronyzeWatcher(_path.default.resolve(file))).on('add', file => {
    const filePath = _path.default.resolve(file);
    console.log(`Now watching file: ${filePath}`);
    const matchInputOption = input.reduce((found, file) => {
      var _match;
      return found || ((_match = (0, _minimatch.match)((0, _glob.sync)(_path.default.resolve(file)), filePath)) === null || _match === void 0 ? void 0 : _match.length) > 0;
    }, false);
    if (matchInputOption) {
      dependencies[filePath] = getRelatedFiles(filePath);
    }
    synchronyzeWatcher(filePath);
  }).on('unlink', file => {
    const filePath = _path.default.resolve(file);
    delete dependencies[_path.default.resolve(filePath)];
    (0, _fp.remove)(dirty, f => f === filePath);
    synchronyzeWatcher(filePath);
  });
  setInterval(() => {
    dirty.forEach(f => {
      console.log(`${f} - Change detected`);
      try {
        readAndCompile(f);
      } catch (e) {
        console.log(`${f} - Error while rendering the file : `, e);
      }
    });
    dirty = [];
  }, 500);
  return [];
};
/* eslint-enable no-console */
exports.default = _default;
module.exports = exports.default;