Object.defineProperty(exports, '__esModule', { value: true });

var safePreset = require('./safe.js');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var safePreset__default = /*#__PURE__*/_interopDefault(safePreset);

/**
 * Maximal minification (might break some pages)
 */ var max = {
    ...safePreset__default.default,
    removeRedundantAttributes: true,
    sortAttributes: true,
    collapseWhitespace: 'all',
    removeComments: 'all',
    removeEmptyElements: true,
    minifyConditionalComments: true,
    removeOptionalTags: true,
    removeAttributeQuotes: true,
    minifyAttributes: {
        metaContent: true,
        redundantWhitespaces: 'agressive'
    },
    mergeScripts: true,
    mergeStyles: true,
    removeUnusedCss: {
        tool: 'purgeCSS'
    },
    minifyCss: {
        preset: 'default'
    },
    minifySvg: {}
};

exports.default = max;
