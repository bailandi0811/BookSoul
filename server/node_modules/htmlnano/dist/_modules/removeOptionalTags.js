Object.defineProperty(exports, '__esModule', { value: true });

var helpers_js = require('../helpers.js');

const startWithWhitespacePattern = /^\s+/;
const bodyStartTagCantBeOmittedWithFirstChildTags = new Set([
    'meta',
    'link',
    'script',
    'style',
    'template'
]);
const tbodyStartTagCantBeOmittedWithPrecededTags = new Set([
    'tbody',
    'thead',
    'tfoot'
]);
const tbodyEndTagCantBeOmittedWithFollowedTags = new Set([
    'tbody',
    'tfoot'
]);
function isEmptyTextNode(node) {
    if (typeof node === 'string' && node.trim() === '') {
        return true;
    }
    return false;
}
function isEmptyNode(node) {
    if (!node.content) {
        return true;
    }
    if (node.content.length) {
        return !node.content.filter((n)=>typeof n === 'string' && isEmptyTextNode(n) ? false : true).length;
    }
    return true;
}
function getFirstChildTag(node, nonEmpty = true) {
    if (node.content && node.content.length) {
        if (nonEmpty) {
            for (const childNode of node.content){
                if (typeof childNode !== 'string') return childNode;
                if (!isEmptyTextNode(childNode)) return childNode;
            }
        } else {
            return node.content[0] || null;
        }
    }
    return null;
}
function getPrevNode(tree, currentNodeIndex, nonEmpty = false) {
    if (nonEmpty) {
        for(let i = currentNodeIndex - 1; i >= 0; i--){
            const node = tree[i];
            if (typeof node !== 'string' && node.tag) return node;
            if (!isEmptyTextNode(node)) return node;
        }
    } else {
        return tree[currentNodeIndex - 1] || null;
    }
    return null;
}
function getNextNode(tree, currentNodeIndex, nonEmpty = false) {
    if (nonEmpty) {
        for(let i = currentNodeIndex + 1; i < tree.length; i++){
            const node = tree[i];
            if (typeof node !== 'string') return node;
            if (!isEmptyTextNode(node)) return node;
        }
    } else {
        return tree[currentNodeIndex + 1] || null;
    }
    return null;
}
function omitTag(node) {
    const optionalTagNode = node;
    optionalTagNode.optionalTagName = typeof node.tag === 'string' ? node.tag : undefined;
    // @ts-expect-error -- deliberately set tag to false
    node.tag = false;
}
function getNodeTagName(node) {
    if (node.tag) return node.tag;
    const optionalTagNode = node;
    return optionalTagNode.optionalTagName || false;
}
function removeOptionalTags(tree) {
    tree.forEach((node, index)=>{
        if (typeof node === 'string') return node;
        if (!node.tag) return node;
        if (node.attrs && Object.keys(node.attrs).length) return node;
        // const prevNode = getPrevNode(tree, index);
        const prevNode = getPrevNode(tree, index);
        const nextNode = getNextNode(tree, index);
        const firstChildNode = getFirstChildTag(node, false);
        /**
         * An "html" element's start tag may be omitted if the first thing inside the "html" element is not a comment.
         * An "html" element's end tag may be omitted if the "html" element is not IMMEDIATELY followed by a comment.
         */ if (node.tag === 'html') {
            let isHtmlStartTagCanBeOmitted = true;
            let isHtmlEndTagCanBeOmitted = true;
            if (typeof firstChildNode === 'string' && helpers_js.isComment(firstChildNode)) {
                isHtmlStartTagCanBeOmitted = false;
            }
            if (typeof nextNode === 'string' && helpers_js.isComment(nextNode)) {
                isHtmlEndTagCanBeOmitted = false;
            }
            if (isHtmlStartTagCanBeOmitted && isHtmlEndTagCanBeOmitted) {
                omitTag(node);
            }
        }
        /**
         * A "head" element's start tag may be omitted if the element is empty, or if the first thing inside the "head" element is an element.
         * A "head" element's end tag may be omitted if the "head" element is not IMMEDIATELY followed by ASCII whitespace or a comment.
         */ if (node.tag === 'head') {
            let isHeadStartTagCanBeOmitted = false;
            let isHeadEndTagCanBeOmitted = true;
            if (isEmptyNode(node) || firstChildNode && typeof firstChildNode === 'object' && firstChildNode.tag) {
                isHeadStartTagCanBeOmitted = true;
            }
            if (nextNode && typeof nextNode === 'string' && (startWithWhitespacePattern.test(nextNode) || helpers_js.isComment(nextNode))) {
                isHeadEndTagCanBeOmitted = false;
            }
            if (isHeadStartTagCanBeOmitted && isHeadEndTagCanBeOmitted) {
                omitTag(node);
            }
        }
        /**
         * A "body" element's start tag may be omitted if the element is empty, or if the first thing inside the "body" element is not ASCII whitespace or a comment, except if the first thing inside the "body" element is a "meta", "link", "script", "style", or "template" element.
         * A "body" element's end tag may be omitted if the "body" element is not IMMEDIATELY followed by a comment.
         */ if (node.tag === 'body') {
            let isBodyStartTagCanBeOmitted = true;
            let isBodyEndTagCanBeOmitted = true;
            if (typeof firstChildNode === 'string' && startWithWhitespacePattern.test(firstChildNode) || typeof firstChildNode === 'string' && helpers_js.isComment(firstChildNode)) {
                isBodyStartTagCanBeOmitted = false;
            }
            if (firstChildNode && typeof firstChildNode === 'object' && firstChildNode.tag && bodyStartTagCantBeOmittedWithFirstChildTags.has(firstChildNode.tag)) {
                isBodyStartTagCanBeOmitted = false;
            }
            if (nextNode && typeof nextNode === 'string' && helpers_js.isComment(nextNode)) {
                isBodyEndTagCanBeOmitted = false;
            }
            if (isBodyStartTagCanBeOmitted && isBodyEndTagCanBeOmitted) {
                omitTag(node);
            }
        }
        /**
         * A "colgroup" element's start tag may be omitted if the first thing inside the "colgroup" element is a "col" element, and if the element is not IMMEDIATELY preceded by another "colgroup" element. It can't be omitted if the element is empty.
         * A "colgroup" element's end tag may be omitted if the "colgroup" element is not IMMEDIATELY followed by ASCII whitespace or a comment.
         */ if (node.tag === 'colgroup') {
            let isColgroupStartTagCanBeOmitted = false;
            let isColgroupEndTagCanBeOmitted = true;
            if (firstChildNode && typeof firstChildNode === 'object' && firstChildNode.tag && firstChildNode.tag === 'col') {
                isColgroupStartTagCanBeOmitted = true;
            }
            if (prevNode && typeof prevNode === 'object' && getNodeTagName(prevNode) === 'colgroup') {
                isColgroupStartTagCanBeOmitted = false;
            }
            if (nextNode && typeof nextNode === 'string' && (startWithWhitespacePattern.test(nextNode) || helpers_js.isComment(nextNode))) {
                isColgroupEndTagCanBeOmitted = false;
            }
            if (isColgroupStartTagCanBeOmitted && isColgroupEndTagCanBeOmitted) {
                omitTag(node);
            }
        }
        /**
         * A "tbody" element's start tag may be omitted if the first thing inside the "tbody" element is a "tr" element, and if the element is not immediately preceded by another "tbody", "thead" or "tfoot" element. It can't be omitted if the element is empty.
         * A "tbody" element's end tag may be omitted if the "tbody" element is not IMMEDIATELY followed by a "tbody" or "tfoot" element.
         */ if (node.tag === 'tbody') {
            let isTbodyStartTagCanBeOmitted = false;
            let isTbodyEndTagCanBeOmitted = true;
            if (firstChildNode && typeof firstChildNode === 'object' && firstChildNode.tag && firstChildNode.tag === 'tr') {
                isTbodyStartTagCanBeOmitted = true;
            }
            if (prevNode && typeof prevNode === 'object') {
                const prevTagName = getNodeTagName(prevNode);
                if (prevTagName && tbodyStartTagCantBeOmittedWithPrecededTags.has(prevTagName)) {
                    isTbodyStartTagCanBeOmitted = false;
                }
            }
            if (nextNode && typeof nextNode === 'object') {
                const nextTagName = getNodeTagName(nextNode);
                if (nextTagName && tbodyEndTagCantBeOmittedWithFollowedTags.has(nextTagName)) {
                    isTbodyEndTagCanBeOmitted = false;
                }
            }
            if (isTbodyStartTagCanBeOmitted && isTbodyEndTagCanBeOmitted) {
                omitTag(node);
            }
        }
        if (node.content && node.content.length) {
            removeOptionalTags(node.content);
        }
        return node;
    });
    return tree;
}
// Specification https://html.spec.whatwg.org/multipage/syntax.html#optional-tags
/** Remove optional tag in the DOM */ const mod = {
    default: removeOptionalTags
};

exports.default = mod;
