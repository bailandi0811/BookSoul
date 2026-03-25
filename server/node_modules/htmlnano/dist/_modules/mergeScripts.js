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

function normalizeAsyncAttr(attrs) {
    if (!attrs) {
        return;
    }
    if (attrs.async === '') {
        attrs.async = true;
    }
    if (attrs.nomodule === '') {
        attrs.nomodule = true;
    }
}
function getScriptType(attrs) {
    const type = attrs.type || 'text/javascript';
    return typeof type === 'string' ? type.toLowerCase() : 'text/javascript';
}
function isMergeableScriptType(type) {
    return type === 'text/javascript' || type === 'application/javascript';
}
const booleanAttrs = new Set([
    'async',
    'defer',
    'nomodule'
]);
const skippedAttrs = new Set([
    'src',
    'integrity',
    'type'
]);
function normalizeScriptAttrsForKey(attrs, scriptType) {
    return normalizeAttrsForKey(attrs, {
        baseAttrs: {
            type: scriptType
        },
        booleanAttrs,
        skippedAttrs
    });
}
function buildScriptKey(attrs, scriptType, scriptSrcIndex) {
    const normalizedAttrs = normalizeScriptAttrsForKey(attrs, scriptType);
    const keyObject = {
        index: scriptSrcIndex,
        ...normalizedAttrs
    };
    const sortedKeys = Object.keys(keyObject).sort();
    const sortedKeyObject = {};
    for (const key of sortedKeys){
        sortedKeyObject[key] = keyObject[key];
    }
    return JSON.stringify(sortedKeyObject);
}
function endsWithLineComment(scriptContent) {
    const lastNewlineIndex = Math.max(scriptContent.lastIndexOf('\n'), scriptContent.lastIndexOf('\r'));
    const lastLine = lastNewlineIndex === -1 ? scriptContent : scriptContent.slice(lastNewlineIndex + 1);
    return /\/\/.*$/.test(lastLine);
}
function mergeScriptNodes(scriptNodesIndex, tracking) {
    for (const scriptNodes of Object.values(scriptNodesIndex)){
        if (scriptNodes.length < 2) {
            continue;
        }
        const lastScriptNode = scriptNodes.pop();
        tracking.mergedScriptNodes.add(lastScriptNode);
        scriptNodes.reverse().forEach((scriptNode)=>{
            let scriptContent = helpers_js.extractTextContentFromNode(scriptNode).trim();
            if (!scriptContent) {
                tracking.removedScriptNodes.add(scriptNode);
                // @ts-expect-error -- remove node
                scriptNode.tag = false;
                scriptNode.content = [];
                return;
            }
            if (endsWithLineComment(scriptContent)) {
                scriptContent += '\n;';
            } else if (scriptContent.slice(-1) !== ';') {
                scriptContent += ';';
            }
            lastScriptNode.content = lastScriptNode.content || [];
            lastScriptNode.content.unshift(scriptContent);
            tracking.removedScriptNodes.add(scriptNode);
            // @ts-expect-error -- remove node
            scriptNode.tag = false;
            scriptNode.content = [];
        });
    }
}
/* Merge multiple <script> into one */ const mod = {
    default (tree) {
        const scriptNodesIndex = {};
        const tracking = {
            mergedScriptNodes: new WeakSet(),
            removedScriptNodes: new WeakSet()
        };
        let scriptSrcIndex = 1;
        tree.match({
            tag: 'script'
        }, (node)=>{
            const nodeAttrs = node.attrs || {};
            normalizeAsyncAttr(nodeAttrs);
            if ('src' in nodeAttrs || 'integrity' in nodeAttrs) {
                scriptSrcIndex++;
                return node;
            }
            const scriptType = getScriptType(nodeAttrs);
            if (!isMergeableScriptType(scriptType)) {
                return node;
            }
            const scriptKey = buildScriptKey(nodeAttrs, scriptType, scriptSrcIndex);
            if (!scriptNodesIndex[scriptKey]) {
                scriptNodesIndex[scriptKey] = [];
            }
            scriptNodesIndex[scriptKey].push(node);
            return node;
        });
        mergeScriptNodes(scriptNodesIndex, tracking);
        return tree;
    }
};

exports.default = mod;
