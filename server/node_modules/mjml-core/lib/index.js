"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "BodyComponent", {
  enumerable: true,
  get: function () {
    return _createComponent.BodyComponent;
  }
});
Object.defineProperty(exports, "HeadComponent", {
  enumerable: true,
  get: function () {
    return _createComponent.HeadComponent;
  }
});
Object.defineProperty(exports, "assignComponents", {
  enumerable: true,
  get: function () {
    return _components.assignComponents;
  }
});
Object.defineProperty(exports, "components", {
  enumerable: true,
  get: function () {
    return _components.default;
  }
});
exports.default = mjml2html;
Object.defineProperty(exports, "handleMjmlConfig", {
  enumerable: true,
  get: function () {
    return _mjmlconfig.default;
  }
});
Object.defineProperty(exports, "initComponent", {
  enumerable: true,
  get: function () {
    return _createComponent.initComponent;
  }
});
Object.defineProperty(exports, "initializeType", {
  enumerable: true,
  get: function () {
    return _type.initializeType;
  }
});
Object.defineProperty(exports, "makeLowerBreakpoint", {
  enumerable: true,
  get: function () {
    return _makeLowerBreakpoint.default;
  }
});
Object.defineProperty(exports, "registerComponent", {
  enumerable: true,
  get: function () {
    return _components.registerComponent;
  }
});
Object.defineProperty(exports, "suffixCssClasses", {
  enumerable: true,
  get: function () {
    return _suffixCssClasses.default;
  }
});
var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));
var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));
var _callSuper2 = _interopRequireDefault(require("@babel/runtime/helpers/callSuper"));
var _inherits2 = _interopRequireDefault(require("@babel/runtime/helpers/inherits"));
var _wrapNativeSuper2 = _interopRequireDefault(require("@babel/runtime/helpers/wrapNativeSuper"));
var _lodash = require("lodash");
var _juice = _interopRequireDefault(require("juice"));
var _cheerio = require("cheerio");
var _prettier = _interopRequireDefault(require("prettier"));
var _htmlnano = _interopRequireDefault(require("htmlnano"));
var _mjmlParserXml = _interopRequireDefault(require("mjml-parser-xml"));
var _mjmlValidator = _interopRequireWildcard(require("mjml-validator"));
var _createComponent = require("./createComponent");
var _components = _interopRequireWildcard(require("./components"));
var _makeLowerBreakpoint = _interopRequireDefault(require("./helpers/makeLowerBreakpoint"));
var _suffixCssClasses = _interopRequireDefault(require("./helpers/suffixCssClasses"));
var _mergeOutlookConditionnals = _interopRequireDefault(require("./helpers/mergeOutlookConditionnals"));
var _minifyOutlookConditionnals = _interopRequireDefault(require("./helpers/minifyOutlookConditionnals"));
var _skeleton = _interopRequireDefault(require("./helpers/skeleton"));
var _type = require("./types/type");
var _mjmlconfig = _interopRequireWildcard(require("./helpers/mjmlconfig"));
const isNode = require('detect-node');
const fs = require('fs');
const path = require('path');
const cssnanoLitePreset = require('cssnano-preset-lite');
function normalizeMinifyCssOption(minifyCss) {
  if (minifyCss === 'lite') {
    return {
      preset: cssnanoLitePreset
    };
  }
  if (minifyCss && typeof minifyCss === 'object') {
    if (minifyCss.preset === 'lite') {
      return {
        ...minifyCss,
        preset: cssnanoLitePreset
      };
    }
    if (Array.isArray(minifyCss.preset) && minifyCss.preset[0] === 'lite') {
      return {
        ...minifyCss,
        preset: [cssnanoLitePreset, minifyCss.preset[1] || {}]
      };
    }
  }
  return minifyCss;
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function sanitizeInlineStyleAttributes(html, syntaxes) {
  return html.replace(/style="([^"]*)"/g, (match, styleValue) => {
    let sanitizedValue = styleValue;
    syntaxes.forEach(({
      prefix,
      suffix
    }, idx) => {
      const regex = new RegExp(`(\\s*)${escapeRegex(prefix)}\\s*([\\s\\S]*?)\\s*${escapeRegex(suffix)}(\\s*)`, 'g');
      sanitizedValue = sanitizedValue.replace(regex, (m, leading, variable, trailing) => `${leading}sanitized${idx}:${variable};${trailing}`);
    });
    sanitizedValue = sanitizedValue.replace(/;$/, '');
    return `style="${sanitizedValue}"`;
  });
}
function restoreInlineStyleAttributes(html, syntaxes) {
  return html.replace(/style="([^"]*)"/g, (match, styleValue) => {
    let restoredValue = styleValue;
    syntaxes.forEach(({
      prefix,
      suffix
    }, idx) => {
      const regex = new RegExp(`sanitized${idx}:([\\s\\S]*?)(;|$)`, 'g');
      restoredValue = restoredValue.replace(regex, `${prefix}$1${suffix}`);
    });
    restoredValue = restoredValue.replace(/;$/, '');
    return `style="${restoredValue}"`;
  });
}
function sanitizeStyleTagBlocks(html, syntaxes) {
  return html.replace(/<style(?:\b[^>]*)?>([\s\S]*?)<\/style\s*>/g, (block, content) => {
    let sanitizedContent = content;
    syntaxes.forEach(({
      prefix,
      suffix
    }, idx) => {
      const regex = new RegExp(`\\s*${escapeRegex(prefix)}([\\s\\S]*?)${escapeRegex(suffix)}\\s*`, 'g');
      sanitizedContent = sanitizedContent.replace(regex, `sanitized${idx}:$1;`);
    });
    return block.replace(content, sanitizedContent);
  });
}
function restoreStyleTagBlocks(html, syntaxes) {
  return html.replace(/sanitized(\d):([\s\S]*?);/g, (match, idx, variable) => {
    const {
      prefix,
      suffix
    } = syntaxes[Number(idx)] || {};
    if (!prefix || !suffix) return match;
    return `${prefix}${variable}${suffix}`;
  });
}
function sanitizeCssValueVariablesHtml(html, syntaxes) {
  let counter = 0;
  const variableMap = {};

  // style="..."
  let result = html.replace(/style="([^"]*)"/g, (match, styleValue) => {
    let sanitizedValue = styleValue;
    const matches = [];
    syntaxes.forEach(({
      prefix,
      suffix
    }) => {
      const regex = new RegExp(`:\\s*${escapeRegex(prefix)}\\s*([\\s\\S]*?)\\s*${escapeRegex(suffix)}`, 'g');
      let m = regex.exec(styleValue);
      while (m) {
        // capture the full token only (prefix...suffix)
        const fullToken = m[0].replace(/^\s*:\s*/, '');
        matches.push({
          index: m.index,
          full: fullToken
        });
        m = regex.exec(styleValue);
      }
    });
    matches.sort((a, b) => a.index - b.index);
    matches.forEach(({
      full
    }) => {
      const tempVar = `variable_temp_${counter}`;
      variableMap[tempVar] = full;
      sanitizedValue = sanitizedValue.replace(full, ` ${tempVar} `);
      counter += 1;
    });
    sanitizedValue = sanitizedValue.replace(/\s+/g, ' ').trim();
    return `style="${sanitizedValue}"`;
  });

  // <style> ... </style>
  result = result.replace(/<style(?:\b[^>]*)?>([\s\S]*?)<\/style\s*>/g, (block, content) => {
    let sanitizedContent = content;
    const styleMatches = [];
    syntaxes.forEach(({
      prefix,
      suffix
    }) => {
      const regex = new RegExp(`:\\s*${escapeRegex(prefix)}\\s*([\\s\\S]*?)\\s*${escapeRegex(suffix)}`, 'g', 'g');
      let m = regex.exec(content);
      while (m) {
        const fullToken = m[0].replace(/^\s*:\s*/, '');
        styleMatches.push({
          index: m.index,
          full: fullToken
        });
        m = regex.exec(content);
      }
    });
    styleMatches.sort((a, b) => a.index - b.index);
    styleMatches.forEach(({
      full
    }) => {
      const tempVar = `variable_temp_${counter}`;
      variableMap[tempVar] = full;
      sanitizedContent = sanitizedContent.replace(full, ` ${tempVar} `);
      counter += 1;
    });
    return block.replace(content, sanitizedContent);
  });
  return {
    result,
    variableMap
  };
}
function restoreCssValueVariablesHtml(html, variableMap) {
  let restoredHtml = html;
  Object.entries(variableMap).forEach(([tempVar, originalVar]) => {
    const regex = new RegExp(`\\b${tempVar}\\b`, 'g');
    restoredHtml = restoredHtml.replace(regex, originalVar);
  });
  return restoredHtml;
}
function sanitizeCssPropertyVariablesHtml(html, syntaxes) {
  let counter = 0;
  const propMap = {};

  // style="..."
  let result = html.replace(/style="([^"]*)"/g, (match, styleValue) => {
    let sanitizedValue = styleValue;
    const matches = [];
    syntaxes.forEach(({
      prefix,
      suffix
    }) => {
      const regex = new RegExp(`${escapeRegex(prefix)}\\s*([\\s\\S]*?)\\s*${escapeRegex(suffix)}\\s*:`, 'g');
      let m = regex.exec(styleValue);
      while (m) {
        matches.push({
          index: m.index,
          full: m[0],
          varOnly: m[1]
        });
        m = regex.exec(styleValue);
      }
    });

    // Replace from left to right
    matches.sort((a, b) => a.index - b.index);
    matches.forEach(({
      full
    }) => {
      const tempVar = `--mj-prop-temp_${counter}`;
      const originalToken = full.replace(/\s*:\s*$/, '');
      propMap[tempVar] = originalToken;
      sanitizedValue = sanitizedValue.replace(full, `${tempVar}:`);
      counter += 1;
    });
    sanitizedValue = sanitizedValue.replace(/\s+/g, ' ').trim();
    return `style="${sanitizedValue}"`;
  });

  // <style> ... </style>
  result = result.replace(/<style(?:\b[^>]*)?>([\s\S]*?)<\/style\s*>/g, (block, content) => {
    let sanitizedContent = content;
    const styleMatches = [];
    syntaxes.forEach(({
      prefix,
      suffix
    }) => {
      const regex = new RegExp(`${escapeRegex(prefix)}\\s*([\\s\\S]*?)\\s*${escapeRegex(suffix)}\\s*:`, 'g');
      let m = regex.exec(content);
      while (m) {
        styleMatches.push({
          index: m.index,
          full: m[0],
          varOnly: m[1]
        });
        m = regex.exec(content);
      }
    });
    styleMatches.sort((a, b) => a.index - b.index);
    styleMatches.forEach(({
      full
    }) => {
      const tempVar = `--mj-prop-temp_${counter}`;
      const originalToken = full.replace(/\s*:\s*$/, '');
      propMap[tempVar] = originalToken;
      sanitizedContent = sanitizedContent.replace(full, `${tempVar}:`);
      counter += 1;
    });
    return block.replace(content, sanitizedContent);
  });
  return {
    result,
    propMap
  };
}
function restoreCssPropertyVariablesHtml(html, propMap) {
  let restoredHtml = html;
  Object.entries(propMap).forEach(([tempVar, originalVar]) => {
    const regex = new RegExp(`${escapeRegex(tempVar)}\\s*:`, 'g');
    restoredHtml = restoredHtml.replace(regex, `${originalVar}:`);
  });
  return restoredHtml;
}
function detectVariableTypeInHtml(html, syntaxes) {
  const styleAttrValues = [];
  html.replace(/style="([^"]*)"/g, (m, val) => {
    styleAttrValues.push(val);
    return m;
  });
  const styleBlockValues = [];
  html.replace(/<style(?:\b[^>]*)?>([\s\S]*?)<\/style\s*>/g, (m, val) => {
    styleBlockValues.push(val);
    return m;
  });
  const styleContent = [...styleAttrValues, ...styleBlockValues].join('\n');
  const cssValuePattern = syntaxes.map(({
    prefix
  }) => `[a-z-]+\\s*:\\s*[^;}"]*${escapeRegex(prefix)}`).join('|');
  const isValueVariable = new RegExp(cssValuePattern, 'i').test(styleContent);
  const cssPropertyPattern = syntaxes.map(({
    prefix,
    suffix
  }) => `${escapeRegex(prefix)}[^${escapeRegex(prefix)}${escapeRegex(suffix)}]*${escapeRegex(suffix)}\\s*:`).join('|');
  const isPropertyVariable = new RegExp(cssPropertyPattern, 'i').test(styleContent);
  const allVariablesPattern = syntaxes.map(({
    prefix,
    suffix
  }) => `${escapeRegex(prefix)}[^${escapeRegex(prefix)}${escapeRegex(suffix)}]*${escapeRegex(suffix)}`).join('|');
  const allVariablesRegex = new RegExp(allVariablesPattern, 'g');
  let isBlockVariable = false;
  let match = allVariablesRegex.exec(styleContent);
  while (match) {
    const beforeVar = styleContent.substring(0, match.index);
    const afterIndex = match.index + match[0].length;
    const afterVar = styleContent.substring(afterIndex);
    const isCssValueCtx = /:[^;{]*$/.test(beforeVar);
    const isCssPropertyCtx = /^\s*:/.test(afterVar);
    if (!isCssValueCtx && !isCssPropertyCtx) {
      isBlockVariable = true;
      break;
    }
    match = allVariablesRegex.exec(styleContent);
  }
  return {
    isBlockVariable,
    isValueVariable,
    isPropertyVariable
  };
}
function detectBrokenTemplateDelimitersInCss(html, syntaxes) {
  const styleAttrValues = [];
  html.replace(/style="([^"]*)"/g, (m, val) => {
    styleAttrValues.push(val);
    return m;
  });
  const styleBlockValues = [];
  html.replace(/<style(?:\b[^>]*)?>([\s\S]*?)<\/style\s*>/g, (m, val) => {
    styleBlockValues.push(val);
    return m;
  });
  const styleContent = [...styleAttrValues, ...styleBlockValues].join('\n');
  const broken = [];
  syntaxes.forEach(({
    prefix,
    suffix
  }) => {
    const prefixRegex = new RegExp(escapeRegex(prefix), 'g');
    const suffixRegex = new RegExp(escapeRegex(suffix), 'g');
    const prefixCount = (styleContent.match(prefixRegex) || []).length;
    const suffixCount = (styleContent.match(suffixRegex) || []).length;
    if (prefixCount !== suffixCount) {
      broken.push({
        prefix,
        suffix,
        prefixCount,
        suffixCount
      });
    }
  });
  return broken;
}
let ValidationError = /*#__PURE__*/function (_Error) {
  function ValidationError(message, errors) {
    var _this;
    (0, _classCallCheck2.default)(this, ValidationError);
    _this = (0, _callSuper2.default)(this, ValidationError, [message]);
    _this.errors = errors;
    return _this;
  }
  (0, _inherits2.default)(ValidationError, _Error);
  return (0, _createClass2.default)(ValidationError);
}(/*#__PURE__*/(0, _wrapNativeSuper2.default)(Error));
async function mjml2html(mjml, options = {}) {
  let content = '';
  let errors = [];

  // Resolve skeleton path via node-only helper to avoid dynamic require in browser builds
  if (isNode && typeof options.skeleton === 'string') {
    // eslint-disable-next-line global-require
    const skeletonLoader = require('./node-only/skeleton-loader');
    const loadSkeleton = skeletonLoader.default || skeletonLoader.loadSkeleton;
    const loadedSk = loadSkeleton && loadSkeleton(options.skeleton);
    if (loadedSk) {
      options.skeleton = loadedSk;
    }
  }
  let packages = {};
  let confOptions = {};
  let mjmlConfigOptions = {};
  let confPreprocessors = [];
  let error = null;
  let componentRootPath = null;

  // Use the existing readMjmlConfig helper
  if (isNode && options.useMjmlConfigOptions || options.mjmlConfigPath) {
    const mjmlConfigContent = (0, _mjmlconfig.readMjmlConfig)(options.mjmlConfigPath);
    if (mjmlConfigContent) {
      // The options can be nested one or two levels deep.
      // This safely gets the options from either structure.
      confOptions = (0, _lodash.get)(mjmlConfigContent, 'mjmlConfig.mjmlConfig.options') ||
      // For double-nested structure
      (0, _lodash.get)(mjmlConfigContent, 'mjmlConfig.options') ||
      // For single-nested structure
      (0, _lodash.get)(mjmlConfigContent, 'options') ||
      // If options are at the top level
      confOptions;

      // This safely gets packages and preprocessors
      const packagesWrapper = (0, _lodash.get)(mjmlConfigContent, 'mjmlConfig.mjmlConfig') || (0, _lodash.get)(mjmlConfigContent, 'mjmlConfig') || mjmlConfigContent;
      packages = packagesWrapper.packages || packages;
      confPreprocessors = packagesWrapper.preprocessors || confPreprocessors;
      componentRootPath = mjmlConfigContent.componentRootPath || componentRootPath;
      error = mjmlConfigContent.error || error;
    }
    if (options.useMjmlConfigOptions) {
      mjmlConfigOptions = confOptions || {};
    }
  }

  // if mjmlConfigPath is specified then we need to register components it on each call
  if (isNode && !error && options.mjmlConfigPath) {
    if (Array.isArray(packages) && packages.length > 0) {
      (0, _mjmlconfig.handleMjmlConfigComponents)(packages, componentRootPath, _components.registerComponent);
    }
  }

  // Merge config options with explicit options (explicit wins)
  const mergedOptions = {
    ...mjmlConfigOptions,
    ...options,
    // Deep merge minifyOptions
    minifyOptions: {
      ...(mjmlConfigOptions.minifyOptions || {}),
      ...(options.minifyOptions || {})
    },
    // Merge preprocessors arrays
    preprocessors: options.preprocessors ? [...confPreprocessors, ...options.preprocessors] : confPreprocessors
  };
  const {
    beautify = false,
    fonts = {
      'Open Sans': 'https://fonts.googleapis.com/css?family=Open+Sans:300,400,500,700',
      'Droid Sans': 'https://fonts.googleapis.com/css?family=Droid+Sans:300,400,500,700',
      Lato: 'https://fonts.googleapis.com/css?family=Lato:300,400,500,700',
      Roboto: 'https://fonts.googleapis.com/css?family=Roboto:300,400,500,700',
      Ubuntu: 'https://fonts.googleapis.com/css?family=Ubuntu:300,400,500,700'
    },
    keepComments = true,
    minify = false,
    minifyOptions,
    ignoreIncludes = true,
    juiceOptions = {},
    juicePreserveTags = null,
    skeleton = _skeleton.default,
    validationLevel = 'soft',
    filePath = '.',
    actualPath = '.',
    preprocessors,
    presets = [],
    printerSupport = false,
    sanitizeStyles = false,
    templateSyntax,
    allowMixedSyntax = false,
    includePath
  } = mergedOptions;
  const components = {
    ..._components.default
  };
  const dependencies = (0, _mjmlValidator.assignDependencies)({}, _mjmlValidator.dependencies);
  for (const preset of presets) {
    (0, _components.assignComponents)(components, preset.components);
    (0, _mjmlValidator.assignDependencies)(dependencies, preset.dependencies);
  }
  if (typeof mjml === 'string') {
    const pathsArr = [];
    if (Array.isArray(includePath)) {
      pathsArr.push(...includePath.filter(p => typeof p === 'string' && p.length > 0));
    } else if (includePath) {
      pathsArr.push(includePath);
    }
    if (pathsArr.length) {
      let base = filePath || '.';
      if (fs.existsSync(base)) {
        const isDir = fs.lstatSync(base).isDirectory();
        base = isDir ? base : path.dirname(base);
      } else {
        base = process.cwd();
      }
      const baseReal = fs.existsSync(base) ? fs.realpathSync(base) : base;
      for (const p of pathsArr) {
        if (fs.existsSync(p)) {
          const r = fs.realpathSync(p);
          const relToBase = path.relative(baseReal, r);
          const isOutsideBase = !relToBase || relToBase.startsWith('..') || path.isAbsolute(relToBase);
          const isRootDir = r === path.parse(r).root;
          if (isRootDir || isOutsideBase) {
            // eslint-disable-next-line no-console
            console.warn(`[MJML security] includePath "${p}" is outside the template base "${baseReal}"${isRootDir ? ' (root directory)' : ''}. Consider scoping includePath to a project templates folder.`);
          }
        }
      }
    }
    mjml = (0, _mjmlParserXml.default)(mjml, {
      keepComments,
      components,
      filePath,
      actualPath,
      preprocessors,
      ignoreIncludes,
      includePath
    });
  }
  const globalData = {
    beforeDoctype: '',
    breakpoint: '480px',
    classes: {},
    classesDefault: {},
    defaultAttributes: {},
    htmlAttributes: {},
    fonts,
    inlineStyle: [],
    headStyle: {},
    componentsHeadStyle: [],
    headRaw: [],
    mediaQueries: {},
    preview: '',
    style: [],
    title: '',
    forceOWADesktop: (0, _lodash.get)(mjml, 'attributes.owa', 'mobile') === 'desktop',
    lang: (0, _lodash.get)(mjml, 'attributes.lang') || 'und',
    dir: (0, _lodash.get)(mjml, 'attributes.dir') || 'auto'
  };
  const validatorOptions = {
    components,
    dependencies,
    initializeType: _type.initializeType
  };
  switch (validationLevel) {
    case 'skip':
      break;
    case 'strict':
      errors = (0, _mjmlValidator.default)(mjml, validatorOptions);
      if (errors.length > 0) {
        throw new ValidationError(`ValidationError: \n ${errors.map(e => e.formattedMessage).join('\n')}`, errors);
      }
      break;
    case 'soft':
    default:
      errors = (0, _mjmlValidator.default)(mjml, validatorOptions);
      break;
  }
  const mjBody = (0, _lodash.find)(mjml.children, {
    tagName: 'mj-body'
  });
  const mjHead = (0, _lodash.find)(mjml.children, {
    tagName: 'mj-head'
  });
  const mjOutsideRaws = (0, _lodash.filter)(mjml.children, {
    tagName: 'mj-raw'
  });
  const processing = (node, context, parseMJML = _lodash.identity) => {
    if (!node) {
      return;
    }
    const component = (0, _createComponent.initComponent)({
      name: node.tagName,
      initialDatas: {
        ...parseMJML(node),
        context
      }
    });
    if (component !== null) {
      if ('handler' in component) {
        return component.handler(); // eslint-disable-line consistent-return
      }
      if ('render' in component) {
        return component.render(); // eslint-disable-line consistent-return
      }
    }
  };
  const applyAttributes = mjml => {
    const parse = (mjml, parentMjClass = '') => {
      const {
        attributes,
        tagName,
        children
      } = mjml;
      const classes = (0, _lodash.get)(mjml.attributes, 'mj-class', '').split(' ');
      const attributesClasses = (0, _lodash.reduce)(classes, (acc, value) => {
        const mjClassValues = globalData.classes[value];
        let multipleClasses = {};
        if (acc['css-class'] && (0, _lodash.get)(mjClassValues, 'css-class')) {
          multipleClasses = {
            'css-class': `${acc['css-class']} ${mjClassValues['css-class']}`
          };
        }
        return {
          ...acc,
          ...mjClassValues,
          ...multipleClasses
        };
      }, {});
      const defaultAttributesForClasses = (0, _lodash.reduce)(parentMjClass.split(' '), (acc, value) => ({
        ...acc,
        ...(0, _lodash.get)(globalData.classesDefault, `${value}.${tagName}`)
      }), {});
      const nextParentMjClass = (0, _lodash.get)(attributes, 'mj-class', parentMjClass);
      return {
        ...mjml,
        attributes: {
          ...globalData.defaultAttributes[tagName],
          ...attributesClasses,
          ...defaultAttributesForClasses,
          ...(0, _lodash.omit)(attributes, ['mj-class'])
        },
        rawAttrs: {
          ...(0, _lodash.omit)(attributes, ['mj-class'])
        },
        globalAttributes: {
          ...globalData.defaultAttributes['mj-all']
        },
        children: (0, _lodash.map)(children, mjml => parse(mjml, nextParentMjClass))
      };
    };
    return parse(mjml);
  };
  const bodyHelpers = {
    components,
    globalData,
    addMediaQuery(className, {
      parsedWidth,
      unit
    }) {
      globalData.mediaQueries[className] = `{ width:${parsedWidth}${unit} !important; max-width: ${parsedWidth}${unit}; }`;
    },
    addHeadStyle(identifier, headStyle) {
      globalData.headStyle[identifier] = headStyle;
    },
    addComponentHeadSyle(headStyle) {
      globalData.componentsHeadStyle.push(headStyle);
    },
    getGlobalDatas: () => globalData,
    processing: (node, context) => processing(node, context, applyAttributes)
  };
  const headHelpers = {
    components,
    globalData,
    add(attr, ...params) {
      if (Array.isArray(globalData[attr])) {
        globalData[attr].push(...params);
      } else if (Object.prototype.hasOwnProperty.call(globalData, attr)) {
        if (params.length > 1) {
          if ((0, _lodash.isObject)(globalData[attr][params[0]])) {
            globalData[attr][params[0]] = {
              ...globalData[attr][params[0]],
              ...params[1]
            };
          } else {
            // eslint-disable-next-line prefer-destructuring
            globalData[attr][params[0]] = params[1];
          }
        } else {
          // eslint-disable-next-line prefer-destructuring
          globalData[attr] = params[0];
        }
      } else {
        throw Error(`An mj-head element add an unkown head attribute : ${attr} with params ${Array.isArray(params) ? params.join('') : params}`);
      }
    }
  };
  globalData.headRaw = processing(mjHead, headHelpers);
  content = processing(mjBody, bodyHelpers, applyAttributes);
  if (!content) {
    throw new Error('Malformed MJML. Check that your structure is correct and enclosed in <mjml> tags.');
  }
  content = (0, _minifyOutlookConditionnals.default)(content);
  if (mjOutsideRaws.length) {
    const toAddBeforeDoctype = mjOutsideRaws.filter(elt => elt.attributes.position && elt.attributes.position === 'file-start');
    if (toAddBeforeDoctype.length) {
      globalData.beforeDoctype = toAddBeforeDoctype.map(elt => elt.content).join('\n');
    }
  }
  if (!(0, _lodash.isEmpty)(globalData.htmlAttributes)) {
    const $ = (0, _cheerio.load)(content, {
      xmlMode: true,
      // otherwise it may move contents that aren't in any tag
      decodeEntities: false // won't escape special characters
    });
    (0, _lodash.each)(globalData.htmlAttributes, (data, selector) => {
      (0, _lodash.each)(data, (value, attrName) => {
        $(selector).each(function getAttr() {
          $(this).attr(attrName, value || '');
        });
      });
    });
    content = $.root().html();
  }
  content = skeleton({
    content,
    ...globalData,
    printerSupport
  });
  if (globalData.inlineStyle.length > 0) {
    if (juicePreserveTags) {
      (0, _lodash.each)(juicePreserveTags, (val, key) => {
        _juice.default.codeBlocks[key] = val;
      });
    }
    content = (0, _juice.default)(content, {
      applyStyleTags: false,
      extraCss: globalData.inlineStyle.join(''),
      insertPreservedExtraCss: false,
      removeStyleTags: false,
      ...juiceOptions
    });
  }
  content = (0, _mergeOutlookConditionnals.default)(content);

  // PostProcessors
  if (minify) {
    let normalizedMinifyOptions = minifyOptions;
    if (minifyOptions && typeof minifyOptions.minifyCss === 'undefined' && typeof minifyOptions.minifyCSS !== 'undefined') {
      const mapped = minifyOptions.minifyCSS ? {
        preset: cssnanoLitePreset
      } : false;
      const {
        minifyCSS,
        ...rest
      } = minifyOptions;
      normalizedMinifyOptions = {
        ...rest,
        minifyCss: mapped
      };
    }
    const {
      minifyCss: userMinifyCss,
      ...minifyOptionsRest
    } = normalizedMinifyOptions || {};
    let resolvedUserMinifyCss;
    if (typeof userMinifyCss !== 'undefined') {
      if (userMinifyCss.options) {
        resolvedUserMinifyCss = userMinifyCss.options;
      } else {
        resolvedUserMinifyCss = userMinifyCss;
      }
    } else {
      resolvedUserMinifyCss = undefined;
    }
    resolvedUserMinifyCss = normalizeMinifyCssOption(resolvedUserMinifyCss);
    const htmlnanoOptions = {
      collapseWhitespace: true,
      minifyCss: typeof resolvedUserMinifyCss !== 'undefined' ? resolvedUserMinifyCss : {
        preset: cssnanoLitePreset
      },
      removeEmptyAttributes: true,
      minifyJs: false,
      removeComments: keepComments ? false : 'safe',
      ...minifyOptionsRest
    };
    let didSanitize = false;
    let isBlockVariable = false;
    let variableMap = {};
    let propMap = {};
    const syntaxes = templateSyntax || [{
      prefix: '{{',
      suffix: '}}'
    }, {
      prefix: '[[',
      suffix: ']]'
    }];
    const cssMinifyEnabled = htmlnanoOptions.minifyCss !== false;
    if (sanitizeStyles === true && cssMinifyEnabled) {
      const broken = detectBrokenTemplateDelimitersInCss(content, syntaxes);
      if (broken.length) {
        const details = broken.map(b => `${b.prefix}…${b.suffix} (${b.prefixCount} open, ${b.suffixCount} close)`).join(', ');
        throw new Error(`Unbalanced template delimiters found in CSS: ${details}. Fix template tokens or disable CSS minification via --config.minifyOptions '{"minifyCss": false}'.`);
      }
      const detected = detectVariableTypeInHtml(content, syntaxes);
      isBlockVariable = detected.isBlockVariable;
      if (!allowMixedSyntax && isBlockVariable && (detected.isValueVariable || detected.isPropertyVariable)) {
        throw new Error('Mixed variable syntax detected. Use either CSS property syntax (e.g., color: {{variable}}) OR block syntax (e.g., {{variable}}), not both in the same document.');
      }
      if (detected.isValueVariable) {
        const sanitized = sanitizeCssValueVariablesHtml(content, syntaxes);
        content = sanitized.result;
        variableMap = sanitized.variableMap;
        didSanitize = true;
      }
      if (detected.isPropertyVariable) {
        const sanitizedProp = sanitizeCssPropertyVariablesHtml(content, syntaxes);
        content = sanitizedProp.result;
        propMap = sanitizedProp.propMap;
        didSanitize = true;
      }
      if (isBlockVariable) {
        content = sanitizeInlineStyleAttributes(content, syntaxes);
        content = sanitizeStyleTagBlocks(content, syntaxes);
        didSanitize = true;
      }
    }
    content = await _htmlnano.default.process(content, htmlnanoOptions).then(res => res.html);
    if (didSanitize) {
      // Always restore CSS value/property placeholders when present
      if (variableMap && Object.keys(variableMap).length > 0) {
        content = restoreCssValueVariablesHtml(content, variableMap);
      }
      if (propMap && Object.keys(propMap).length > 0) {
        content = restoreCssPropertyVariablesHtml(content, propMap);
      }

      // Additionally restore block-style tokens if they were detected
      if (isBlockVariable) {
        content = restoreInlineStyleAttributes(content, syntaxes);
        content = restoreStyleTagBlocks(content, syntaxes);
      }
    }
  } else if (beautify) {
    content = await _prettier.default.format(content, {
      parser: 'html',
      printWidth: 240
    });
  }
  return {
    html: content,
    json: mjml,
    errors
  };
}
if (isNode) {
  (0, _mjmlconfig.default)(process.cwd(), _components.registerComponent);
}