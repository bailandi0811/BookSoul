Object.defineProperty(exports, '__esModule', { value: true });

var helpers_js = require('../helpers.js');

// These options must be set and shouldn't be overriden to ensure uncss doesn't look at linked stylesheets.
const uncssOptions = {
    ignoreSheets: [
        /\s*/
    ],
    stylesheets: []
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- uncss has no types
function processStyleNodeUnCSS(html, styleNode, uncssOptions, uncss) {
    const css = helpers_js.extractCssFromStyleNode(styleNode);
    const { strippedCss, isCdataWrapped } = helpers_js.stripCssCdata(css);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- uncss no types
    return runUncss(html, strippedCss, uncssOptions, uncss).then((css)=>{
        // uncss may have left some style tags empty
        if (css.trim().length === 0) {
            // @ts-expect-error -- explicitly remove the tag
            styleNode.tag = false;
            styleNode.content = [];
            return;
        }
        styleNode.content = [
            helpers_js.wrapCssCdata(css, isCdataWrapped)
        ];
    });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- uncss callback uses untyped args
function runUncss(html, css, userOptions, uncss) {
    if (typeof userOptions !== 'object') {
        userOptions = {};
    }
    const options = {
        ...userOptions,
        ...uncssOptions
    };
    return new Promise((resolve, reject)=>{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- we dont have uncss types
        options.raw = css;
        uncss(html, options, (error, output)=>{
            if (error) {
                reject(error);
                return;
            }
            resolve(output);
        });
    });
}
const purgeFromHtml = function(tree) {
    // content is not used as we can directly used the parsed HTML,
    // making the process faster
    const selectors = [];
    tree.walk((node)=>{
        const classes = getSelectorTokens(node.attrs && node.attrs.class);
        const ids = getSelectorTokens(node.attrs && node.attrs.id);
        selectors.push(...classes, ...ids);
        if (node.tag) {
            selectors.push(node.tag);
        }
        return node;
    });
    return ()=>selectors;
};
function processStyleNodePurgeCSS(tree, styleNode, purgecssOptions, purgecss, extractor) {
    const css = helpers_js.extractCssFromStyleNode(styleNode);
    const { strippedCss, isCdataWrapped } = helpers_js.stripCssCdata(css);
    return runPurgecss(tree, strippedCss, purgecssOptions, purgecss, extractor).then((css)=>{
        if (css.trim().length === 0) {
            // @ts-expect-error -- explicitly remove the tag
            styleNode.tag = false;
            styleNode.content = [];
            return;
        }
        styleNode.content = [
            helpers_js.wrapCssCdata(css, isCdataWrapped)
        ];
    });
}
function runPurgecss(tree, css, userOptions, purgecss, extractor) {
    if (typeof userOptions !== 'object') {
        userOptions = {};
    }
    const options = {
        ...userOptions,
        content: [
            {
                raw: tree.render(),
                extension: 'html'
            }
        ],
        css: [
            {
                raw: css,
                // @ts-expect-error -- old purgecss options
                extension: 'css'
            }
        ],
        extractors: [
            {
                extractor,
                extensions: [
                    'html'
                ]
            }
        ]
    };
    return new purgecss.PurgeCSS().purge(options).then((result)=>{
        return result[0].css;
    });
}
/** Remove unused CSS */ const mod = {
    async default (tree, options, userOptions) {
        var _resolvedOptions_tool;
        const promises = [];
        let html;
        let extractor;
        const purgecss = await helpers_js.optionalImport('purgecss');
        const uncss = await helpers_js.optionalImport('uncss');
        const resolvedOptions = resolveUserOptions(userOptions);
        const tool = (_resolvedOptions_tool = resolvedOptions.tool) != null ? _resolvedOptions_tool : 'purgeCSS';
        const toolOptions = stripToolOption(resolvedOptions);
        tree.walk((node)=>{
            if (helpers_js.isStyleNode(node) && helpers_js.isCssStyleType(node)) {
                if (tool === 'purgeCSS') {
                    if (purgecss) {
                        extractor != null ? extractor : extractor = purgeFromHtml(tree);
                        promises.push(processStyleNodePurgeCSS(tree, node, toolOptions, purgecss, extractor));
                    }
                } else if (tool === 'uncss') {
                    if (uncss) {
                        html != null ? html : html = tree.render(tree);
                        promises.push(processStyleNodeUnCSS(html, node, toolOptions, uncss));
                    }
                }
            }
            return node;
        });
        return Promise.all(promises).then(()=>tree);
    }
};
function getSelectorTokens(value) {
    if (typeof value !== 'string') {
        return [];
    }
    return value.split(/\s+/).filter(Boolean);
}
function resolveUserOptions(userOptions) {
    if (userOptions && typeof userOptions === 'object') {
        return userOptions;
    }
    return {};
}
function stripToolOption(options) {
    const { tool: _tool, ...rest } = options;
    return rest;
}

exports.default = mod;
