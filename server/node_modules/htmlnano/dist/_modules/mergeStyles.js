Object.defineProperty(exports, '__esModule', { value: true });

var helpers_js = require('../helpers.js');

function normalizeAttrsForKey(attrs, config) {
    const normalized = {
        ...config.baseAttrs
    };
    for (const [key, value] of Object.entries(attrs || {})){
        if (config.skippedAttrs.has(key) || value === undefined) {
            continue;
        }
        if (config.booleanAttrs.has(key)) {
            normalized[key] = true;
            continue;
        }
        normalized[key] = value;
    }
    return normalized;
}

const booleanAttrs = new Set([
    'amp-custom',
    'disabled'
]);
const skippedAttrs = new Set([
    'type',
    'media'
]);
function normalizeStyleType(attrs) {
    if (!attrs || typeof attrs.type !== 'string') {
        return 'text/css';
    }
    const type = attrs.type.trim();
    return type ? type.toLowerCase() : 'text/css';
}
function normalizeStyleMedia(attrs) {
    if (!attrs || typeof attrs.media !== 'string') {
        return 'all';
    }
    const media = attrs.media.trim();
    return media ? media.replace(/\s+/g, ' ').toLowerCase() : 'all';
}
function normalizeStyleAttrsForKey(attrs) {
    return normalizeAttrsForKey(attrs, {
        booleanAttrs,
        skippedAttrs
    });
}
function buildStyleKey(attrs) {
    const keyObject = {
        type: normalizeStyleType(attrs),
        media: normalizeStyleMedia(attrs),
        ...normalizeStyleAttrsForKey(attrs)
    };
    const sortedKeys = Object.keys(keyObject).sort();
    const sortedKeyObject = {};
    for (const key of sortedKeys){
        sortedKeyObject[key] = keyObject[key];
    }
    return JSON.stringify(sortedKeyObject);
}
function extractStyleTextContent(node) {
    if (typeof node.content === 'string') {
        return node.content;
    }
    return helpers_js.extractTextContentFromNode(node);
}
/* Merge multiple <style> into one */ const mod = {
    default (tree) {
        const styleNodes = {};
        tree.match({
            tag: 'style'
        }, (node)=>{
            if (typeof node !== 'object' || !node.tag || !node.content) return node;
            const nodeAttrs = node.attrs || {};
            // Skip <style scoped></style>
            // https://developer.mozilla.org/en/docs/Web/HTML/Element/style
            //
            // Also skip SRI, reasons are documented in "minifyJs" module
            if ('scoped' in nodeAttrs || 'integrity' in nodeAttrs) {
                return node;
            }
            if (helpers_js.isAmpBoilerplate(node)) {
                return node;
            }
            const styleKey = buildStyleKey(nodeAttrs);
            if (styleKey in styleNodes) {
                var _styleNodes_styleKey, _content;
                const styleContent = extractStyleTextContent(node);
                (_content = (_styleNodes_styleKey = styleNodes[styleKey]).content) != null ? _content : _styleNodes_styleKey.content = [];
                styleNodes[styleKey].content.push(' ' + styleContent);
                return ''; // Remove node
            }
            node.content = node.content || [];
            styleNodes[styleKey] = node;
            return node;
        });
        return tree;
    }
};

exports.default = mod;
