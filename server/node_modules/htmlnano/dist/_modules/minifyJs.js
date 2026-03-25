Object.defineProperty(exports, '__esModule', { value: true });

var helpers_js = require('../helpers.js');
var removeRedundantAttributes_js = require('./removeRedundantAttributes.js');

/** Minify JS with Terser */ const mod = {
    async default (tree, _, terserOptions) {
        const terser = await helpers_js.optionalImport('terser');
        if (!terser) return tree;
        const promises = [];
        let p;
        tree.walk((node)=>{
            const nodeAttrs = node.attrs || {};
            /**
         * Skip SRI
         *
         * If the input <script /> has an SRI attribute, it means that the original <script /> could be trusted,
         * and should not be altered anymore.
         *
         * htmlnano is exactly an MITM that SRI is designed to protect from. If htmlnano or its dependencies get
         * compromised and introduces malicious code, then it is up to the original SRI to protect the end user.
         *
         * So htmlnano will simply skip <script /> that has SRI.
         * If developers do trust htmlnano, they should generate SRI after htmlnano modify the <script />.
         */ if ('integrity' in nodeAttrs) {
                return node;
            }
            if (node.tag && node.tag === 'script') {
                const rawMimeType = typeof nodeAttrs.type === 'string' ? helpers_js.normalizeMimeType(nodeAttrs.type) : undefined;
                const mimeType = rawMimeType || 'text/javascript';
                if (removeRedundantAttributes_js.redundantScriptTypes.has(mimeType) || mimeType === 'module') {
                    const scriptTerserOptions = resolveScriptTerserOptions(terserOptions, mimeType);
                    p = processScriptNode(node, scriptTerserOptions, terser);
                    if (p) {
                        promises.push(p);
                    }
                }
            }
            if (node.attrs) {
                promises.push(...processNodeWithOnAttrs(node, terserOptions, terser));
            }
            return node;
        });
        return Promise.all(promises).then(()=>{
            applySmartQuoteOptions(tree);
            return tree;
        });
    }
};
function stripCdata(js) {
    const leftStrippedJs = js.replace(/\/\/\s*<!\[CDATA\[/, '').replace(/\/\*\s*<!\[CDATA\[\s*\*\//, '');
    if (leftStrippedJs === js) {
        return js;
    }
    const strippedJs = leftStrippedJs.replace(/\/\/\s*\]\]>/, '').replace(/\/\*\s*\]\]>\s*\*\//, '');
    return leftStrippedJs === strippedJs ? js : strippedJs;
}
function resolveScriptTerserOptions(terserOptions, mimeType) {
    var _terserOptions_toplevel, _terserOptions_compress, _terserOptions_mangle;
    if (mimeType !== 'module' || terserOptions.module !== undefined) {
        return terserOptions;
    }
    return {
        ...terserOptions,
        module: true,
        toplevel: (_terserOptions_toplevel = terserOptions.toplevel) != null ? _terserOptions_toplevel : false,
        compress: (_terserOptions_compress = terserOptions.compress) != null ? _terserOptions_compress : false,
        mangle: (_terserOptions_mangle = terserOptions.mangle) != null ? _terserOptions_mangle : false
    };
}
function resolveOnAttrTerserOptions(terserOptions) {
    const output = terserOptions.output;
    const format = terserOptions.format;
    const outputHasQuoteStyle = !!(output && typeof output === 'object' && 'quote_style' in output);
    const formatHasQuoteStyle = !!(format && typeof format === 'object' && 'quote_style' in format);
    if (outputHasQuoteStyle || formatHasQuoteStyle) {
        return terserOptions;
    }
    const resolved = {
        ...terserOptions
    };
    if (format && typeof format === 'object') {
        resolved.format = {
            ...format,
            ['quote_style']: 3
        };
    }
    if (output && typeof output === 'object') {
        resolved.output = {
            ...output,
            ['quote_style']: 3
        };
    }
    if (!format && !output) {
        resolved.output = {
            ['quote_style']: 3
        };
    }
    return resolved;
}
function applySmartQuoteOptions(tree) {
    var _tree, _options, _tree_options, _quoteStyle, _tree_options1, _replaceQuote;
    const quoteState = analyzeTreeQuotes(tree);
    if (!quoteState.needsSmartQuotes || quoteState.hasMixedQuotes) {
        return;
    }
    (_options = (_tree = tree).options) != null ? _options : _tree.options = {};
    (_quoteStyle = (_tree_options = tree.options).quoteStyle) != null ? _quoteStyle : _tree_options.quoteStyle = 0;
    (_replaceQuote = (_tree_options1 = tree.options).replaceQuote) != null ? _replaceQuote : _tree_options1.replaceQuote = false;
}
function analyzeTreeQuotes(tree) {
    let needsSmartQuotes = false;
    let hasMixedQuotes = false;
    tree.walk((node)=>{
        if (!node || !node.attrs) {
            return node;
        }
        for (const [attrName, attrValue] of Object.entries(node.attrs)){
            if (typeof attrValue !== 'string') {
                continue;
            }
            const hasDoubleQuote = attrValue.includes('"');
            const hasSingleQuote = attrValue.includes('\'');
            if (hasDoubleQuote && helpers_js.isEventHandler(attrName)) {
                needsSmartQuotes = true;
            }
            if (hasDoubleQuote && hasSingleQuote) {
                hasMixedQuotes = true;
            }
            if (needsSmartQuotes && hasMixedQuotes) {
                return node;
            }
        }
        return node;
    });
    return {
        needsSmartQuotes,
        hasMixedQuotes
    };
}
function processScriptNode(scriptNode, terserOptions, terser) {
    let js = helpers_js.extractTextContentFromNode(scriptNode).trim();
    if (!js.length) {
        return;
    }
    // Improve performance by avoiding calling stripCdata again and again
    let isCdataWrapped = false;
    if (js.includes('CDATA')) {
        const strippedJs = stripCdata(js);
        isCdataWrapped = js !== strippedJs;
        js = strippedJs;
    }
    return terser.minify(js, terserOptions).then((result)=>{
        if ('error' in result) {
            throw new Error(result.error);
        }
        if (result.code === undefined) {
            return;
        }
        let content = result.code;
        if (isCdataWrapped) {
            content = '/*<![CDATA[*/' + content + '/*]]>*/';
        }
        scriptNode.content = [
            content
        ];
    });
}
function processNodeWithOnAttrs(node, terserOptions, terser) {
    const jsWrapperStart = 'a=function(){';
    const jsWrapperEnd = '};a();';
    const onAttrTerserOptions = resolveOnAttrTerserOptions(terserOptions);
    const promises = [];
    if (!node.attrs) {
        return promises;
    }
    for(const attrName in node.attrs){
        if (!helpers_js.isEventHandler(attrName)) {
            continue;
        }
        const attrValue = node.attrs[attrName];
        if (typeof attrValue !== 'string') {
            continue;
        }
        // For example onclick="return false" is valid,
        // but "return false;" is invalid (error: 'return' outside of function)
        // Therefore the attribute's code should be wrapped inside function:
        // "function _(){return false;}"
        const wrappedJs = jsWrapperStart + node.attrs[attrName] + jsWrapperEnd;
        const promise = terser.minify(wrappedJs, onAttrTerserOptions).then(({ code })=>{
            if (code) {
                const minifiedJs = code.substring(jsWrapperStart.length, code.length - jsWrapperEnd.length);
                node.attrs[attrName] = minifiedJs;
            }
        }).catch((error)=>{
            // Skip invalid inline handler code and preserve the original value.
            if (isTerserParseError(error)) {
                return;
            }
            throw error;
        });
        promises.push(promise);
    }
    return promises;
}
function isTerserParseError(error) {
    if (!(error instanceof Error)) {
        return false;
    }
    return error.name === 'SyntaxError' || error.message.includes('JS_Parse_Error');
}

exports.default = mod;
