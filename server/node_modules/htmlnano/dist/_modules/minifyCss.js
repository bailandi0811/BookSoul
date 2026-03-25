Object.defineProperty(exports, '__esModule', { value: true });

var helpers_js = require('../helpers.js');

const postcssOptions = {
    // Prevent the following warning from being shown:
    // > Without `from` option PostCSS could generate wrong source map and will not find Browserslist config.
    // > Set it to CSS file path or to `undefined` to prevent this warning.
    from: undefined
};
/** Minify CSS with cssnano */ const mod = {
    async default (tree, _, cssnanoOptions) {
        const cssnano = await helpers_js.optionalImport('cssnano');
        const postcss = await helpers_js.optionalImport('postcss');
        if (!cssnano || !postcss) {
            return tree;
        }
        const promises = [];
        let p;
        tree.walk((node)=>{
            // Skip SRI, reasons are documented in "minifyJs" module
            if (node.attrs && 'integrity' in node.attrs) {
                return node;
            }
            if (helpers_js.isStyleNode(node) && helpers_js.isCssStyleType(node)) {
                p = processStyleNode(node, cssnanoOptions, cssnano, postcss);
                if (p) {
                    promises.push(p);
                }
            } else if (node.attrs && node.attrs.style) {
                p = processStyleAttr(node, cssnanoOptions, cssnano, postcss);
                if (p) {
                    promises.push(p);
                }
            }
            return node;
        });
        return Promise.all(promises).then(()=>tree);
    }
};
function processStyleNode(styleNode, cssnanoOptions, cssnano, postcss) {
    let css = helpers_js.extractCssFromStyleNode(styleNode);
    if (!css || css.trim() === '') return;
    // Improve performance by avoiding calling stripCssCdata again and again
    const { strippedCss, isCdataWrapped } = helpers_js.stripCssCdata(css);
    css = strippedCss;
    return postcss([
        cssnano(cssnanoOptions)
    ]).process(css, postcssOptions).then((result)=>{
        const minifiedCss = isCdataWrapped ? result.toString() : result.css;
        styleNode.content = [
            helpers_js.wrapCssCdata(minifiedCss, isCdataWrapped)
        ];
    });
}
function processStyleAttr(node, cssnanoOptions, cssnano, postcss) {
    // CSS "color: red;" is invalid. Therefore it should be wrapped inside some selector:
    // a{color: red;}
    const wrapperStart = 'a{';
    const wrapperEnd = '}';
    if (!node.attrs || !node.attrs.style || typeof node.attrs.style !== 'string') {
        return;
    }
    if (node.attrs.style.trim() === '') {
        return;
    }
    const wrappedStyle = wrapperStart + (node.attrs.style || '') + wrapperEnd;
    return postcss([
        cssnano(cssnanoOptions)
    ]).process(wrappedStyle, postcssOptions).then((result)=>{
        const minifiedCss = result.css;
        // Remove wrapperStart at the start and wrapperEnd at the end of minifiedCss
        node.attrs.style = minifiedCss.substring(wrapperStart.length, minifiedCss.length - wrapperEnd.length);
    });
}

exports.default = mod;
