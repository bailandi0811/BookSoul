import { isComment } from '../helpers.mjs';

const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
]);
function normalizeOptions(moduleOptions) {
    if (typeof moduleOptions === 'object' && moduleOptions) {
        return {
            removeWithAttributes: moduleOptions.removeWithAttributes === true
        };
    }
    return {
        removeWithAttributes: false
    };
}
function hasAttributes(node) {
    return !!node.attrs && Object.keys(node.attrs).length > 0;
}
function isIgnorableText(text) {
    return isComment(text) || text.trim() === '';
}
function isEmptyContent(content) {
    if (!content) {
        return true;
    }
    const contentArray = Array.isArray(content) ? content : [
        content
    ];
    if (contentArray.length === 0) {
        return true;
    }
    return contentArray.every((child)=>typeof child === 'string' && isIgnorableText(child));
}
function shouldRemoveNode(node, options) {
    if (!node.tag || typeof node.tag !== 'string') {
        return false;
    }
    if (voidElements.has(node.tag.toLowerCase())) {
        return false;
    }
    if (!options.removeWithAttributes && hasAttributes(node)) {
        return false;
    }
    return isEmptyContent(node.content);
}
function pruneNodes(nodes, options) {
    const result = [];
    for (const node of nodes){
        if (typeof node === 'string') {
            result.push(node);
            continue;
        }
        if (node.content) {
            const contentArray = Array.isArray(node.content) ? node.content : [
                node.content
            ];
            node.content = pruneNodes(contentArray, options);
        }
        if (shouldRemoveNode(node, options)) {
            continue;
        }
        result.push(node);
    }
    return result;
}
const mod = {
    default (tree, _options, moduleOptions) {
        const normalizedOptions = normalizeOptions(moduleOptions);
        const pruned = pruneNodes(tree, normalizedOptions);
        tree.splice(0, tree.length, ...pruned);
        return tree;
    }
};

export { mod as default };
