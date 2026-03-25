import safePreset from './safe.mjs';

/**
 * Maximal minification (might break some pages)
 */ var max = {
    ...safePreset,
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

export { max as default };
