import PostHTML from 'posthtml';

type PostHTMLNodeLike = PostHTML.Node | string;

declare function isAmpBoilerplate(node: PostHTML.Node): boolean;
declare function isComment(content: PostHTMLNodeLike | null): boolean;
declare function isConditionalComment(content: string): boolean;
declare function isStyleNode(node: PostHTML.Node): boolean | undefined;
declare function extractCssFromStyleNode(node: PostHTML.Node): string | undefined;
declare function stripCssCdata(css: string): {
    strippedCss: string;
    isCdataWrapped: boolean;
};
declare function wrapCssCdata(css: string, isCdataWrapped: boolean): string;
declare function isCssStyleType(node: PostHTML.Node): boolean;
declare function normalizeMimeType(value: string): string;
declare function isEventHandler(attributeName: string): boolean | "";
declare function extractTextContentFromNode(node: PostHTML.Node): string;
declare function optionalImport<Module = unknown, Default = Module>(moduleName: string): Promise<(Module & {
    default?: Default;
}) | NonNullable<Default> | null>;

export { extractCssFromStyleNode, extractTextContentFromNode, isAmpBoilerplate, isComment, isConditionalComment, isCssStyleType, isEventHandler, isStyleNode, normalizeMimeType, optionalImport, stripCssCdata, wrapCssCdata };
