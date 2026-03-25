import { normalizeMimeType } from '../helpers.mjs';

const rNodeAttrsTypeJson = /(?:\/|\+)json$/i;
const mod = {
    onContent () {
        return (content, node)=>{
            // Skip SRI, reasons are documented in "minifyJs" module
            if (node.attrs && 'integrity' in node.attrs) {
                return content;
            }
            const nodeType = node.attrs && typeof node.attrs.type === 'string' ? normalizeMimeType(node.attrs.type) : undefined;
            if (nodeType && rNodeAttrsTypeJson.test(nodeType)) {
                try {
                    const jsonContent = typeof content === 'string' ? content : Array.isArray(content) && content.every((item)=>typeof item === 'string') ? content.join('') : null;
                    if (jsonContent === null) {
                        return content;
                    }
                    return [
                        JSON.stringify(JSON.parse(jsonContent))
                    ];
                } catch (unused) {
                // Invalid JSON
                }
            }
            return content;
        };
    }
};

export { mod as default };
