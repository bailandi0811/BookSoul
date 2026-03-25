const ampBoilerplateAttributes = [
    'amp-boilerplate',
    'amp4ads-boilerplate',
    'amp4email-boilerplate'
];
const cssCdataStart = '<![CDATA[';
const cssCdataEnd = ']]>';
function isAmpBoilerplate(node) {
    if (!node.attrs) {
        return false;
    }
    for (const attr of ampBoilerplateAttributes){
        if (attr in node.attrs) {
            return true;
        }
    }
    return false;
}
function isComment(content) {
    if (typeof content === 'string') {
        return content.trim().startsWith('<!--');
    }
    return false;
}
function isConditionalComment(content) {
    const clean = (content || '').trim();
    return clean.startsWith('<!--[if') || clean === '<!--<![endif]-->';
}
function isStyleNode(node) {
    return node.tag === 'style' && !isAmpBoilerplate(node) && 'content' in node && node.content && node.content.length > 0;
}
function extractCssFromStyleNode(node) {
    return Array.isArray(node.content) ? node.content.join(' ') : node.content;
}
function stripCssCdata(css) {
    const trimmed = css.trim();
    if (!trimmed.startsWith(cssCdataStart) || !trimmed.endsWith(cssCdataEnd)) {
        return {
            strippedCss: css,
            isCdataWrapped: false
        };
    }
    const strippedCss = trimmed.slice(cssCdataStart.length, trimmed.length - cssCdataEnd.length);
    return {
        strippedCss,
        isCdataWrapped: true
    };
}
function wrapCssCdata(css, isCdataWrapped) {
    if (!isCdataWrapped) {
        return css;
    }
    return `${cssCdataStart}${css}${cssCdataEnd}`;
}
function isCssStyleType(node) {
    if (!node.attrs || !('type' in node.attrs)) {
        return true;
    }
    const rawType = node.attrs.type;
    if (rawType === '') {
        return true;
    }
    if (typeof rawType !== 'string') {
        return false;
    }
    const normalizedType = rawType.trim().toLowerCase();
    return /^text\/css(?:$|\s*;)/.test(normalizedType);
}
function normalizeMimeType(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }
    const [mimeType] = trimmed.split(';');
    return mimeType.trim().toLowerCase();
}
function isEventHandler(attributeName) {
    return attributeName && attributeName.slice(0, 2).toLowerCase() === 'on' && attributeName.length >= 5;
}
function extractTextContentFromNode(node) {
    if (!node.content) {
        return '';
    }
    if (!Array.isArray(node.content)) {
        return '';
    }
    let content = '';
    for (const child of node.content){
        if (typeof child === 'string') {
            content += child;
        }
    }
    return content;
}
async function optionalImport(moduleName) {
    try {
        const module = await import(moduleName);
        return module.default || module;
    } catch (e) {
        if (typeof e === 'object' && e && 'code' in e && (e.code === 'MODULE_NOT_FOUND' || e.code === 'ERR_MODULE_NOT_FOUND')) {
            return null;
        }
        throw e;
    }
}

export { extractCssFromStyleNode, extractTextContentFromNode, isAmpBoilerplate, isComment, isConditionalComment, isCssStyleType, isEventHandler, isStyleNode, normalizeMimeType, optionalImport, stripCssCdata, wrapCssCdata };
