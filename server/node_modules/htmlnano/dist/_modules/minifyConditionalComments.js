Object.defineProperty(exports, '__esModule', { value: true });

var htmlnano = require('../index.js');
var helpers_js = require('../helpers.js');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var htmlnano__default = /*#__PURE__*/_interopDefault(htmlnano);

// Spec: https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/ms537512(v=vs.85)
const CONDITIONAL_COMMENT_HIDDEN_REGEXP = /(<!--\[if\s+?[^<>[\]]+?]>)([\s\S]*?)(<!\[endif\]-->)/gm;
const CONDITIONAL_COMMENT_REVEALED_REGEXP = /(<!--\[if\s+?[^<>[\]]+?\]><!-->)([\s\S]*?)(<!--<!\[endif\]-->)/gm;
async function minifyConditionalComments(tree, htmlnanoOptions) {
    // forEach, tree.walk, tree.match just don't support Promise.
    for(let i = 0, len = tree.length; i < len; i++){
        const node = tree[i];
        if (typeof node === 'string') {
            if (helpers_js.isConditionalComment(node)) {
                tree[i] = await minifyContentInsideConditionalComments(node, htmlnanoOptions);
            }
        } else if (node.content && node.content.length) {
            node.content = await minifyConditionalComments(node.content, htmlnanoOptions);
        }
    }
    return tree;
}
/** Minify content inside conditional comments */ const mod = {
    default: minifyConditionalComments
};
function collectConditionalCommentMatches(text, regexp) {
    const matches = [];
    regexp.lastIndex = 0;
    let match;
    while((match = regexp.exec(text)) !== null){
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
            open: match[1],
            content: match[2],
            close: match[3]
        });
    }
    return matches;
}
function hasHtmlOpeningWithoutClosing(content) {
    return /<html\b/i.test(content) && !/<\/html>/i.test(content);
}
async function minifyContentInsideConditionalComments(text, htmlnanoOptions) {
    const matches = [
        ...collectConditionalCommentMatches(text, CONDITIONAL_COMMENT_HIDDEN_REGEXP),
        ...collectConditionalCommentMatches(text, CONDITIONAL_COMMENT_REVEALED_REGEXP)
    ].sort((a, b)=>a.start - b.start);
    if (!matches.length) {
        return Promise.resolve(text);
    }
    let result = '';
    let lastIndex = 0;
    for (const match of matches){
        result += text.slice(lastIndex, match.start);
        const processed = await htmlnano__default.default.process(match.content, htmlnanoOptions, {}, {});
        let minified = processed.html;
        if (hasHtmlOpeningWithoutClosing(match.content) && /<\/html>/i.test(minified)) {
            minified = minified.replace(/<\/html>/i, '');
        }
        result += match.open + minified + match.close;
        lastIndex = match.end;
    }
    result += text.slice(lastIndex);
    return result;
}

exports.default = mod;
