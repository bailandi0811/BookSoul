import PostHTML from 'posthtml';
import { MinifyOptions } from 'terser';
import { Options } from 'cssnano';
import { Config } from 'svgo';
import { UserDefinedOptions } from 'purgecss';

type PostHTMLTreeLike = [PostHTML.Node] & PostHTML.NodeAPI & {
    options?: {
        quoteAllAttributes?: boolean | undefined;
        quoteStyle?: 0 | 1 | 2 | undefined;
        replaceQuote?: boolean | undefined;
    } | undefined;
    render(): string;
    render(node: PostHTML.Node | PostHTMLTreeLike, renderOptions?: any): string;
};
type MaybeArray<T> = T | Array<T>;
type PostHTMLNodeLike = PostHTML.Node | string;
type HtmlnanoTemplateRule = {
    tag: string;
    attrs?: Record<string, string | boolean | void>;
};
type MinifyHtmlTemplateOptions = boolean | HtmlnanoTemplateRule[];
interface HtmlnanoOptions {
    skipConfigLoading?: boolean;
    configPath?: string;
    skipInternalWarnings?: boolean;
    collapseAttributeWhitespace?: boolean;
    collapseBooleanAttributes?: {
        amphtml?: boolean;
    };
    collapseWhitespace?: 'conservative' | 'all' | 'aggressive';
    custom?: MaybeArray<(tree: PostHTMLTreeLike, options?: any) => (PostHTML.Node | PostHTMLTreeLike)>;
    deduplicateAttributeValues?: boolean;
    minifyUrls?: URL | string | false;
    mergeStyles?: boolean;
    mergeScripts?: boolean;
    minifyCss?: Options | boolean;
    minifyHtmlTemplate?: MinifyHtmlTemplateOptions;
    minifyConditionalComments?: boolean;
    minifyJs?: MinifyOptions | boolean;
    minifyJson?: boolean;
    minifyAttributes?: boolean | {
        metaContent?: boolean;
        redundantWhitespaces?: 'safe' | 'agressive' | false;
    };
    minifySvg?: Config | boolean;
    normalizeAttributeValues?: boolean;
    removeAttributeQuotes?: boolean | {
        force?: boolean;
    };
    removeComments?: boolean | RegExp | ((comment: string) => boolean) | string;
    removeEmptyAttributes?: boolean;
    removeEmptyElements?: boolean | {
        removeWithAttributes?: boolean;
    };
    removeRedundantAttributes?: boolean;
    removeOptionalTags?: boolean;
    removeUnusedCss?: boolean | ({
        tool: 'purgeCSS';
    } & Omit<UserDefinedOptions, 'content' | 'css' | 'extractors'>) | {
        banner?: boolean;
        csspath?: string;
        htmlroot?: string;
        ignore?: (string | RegExp)[];
        inject?: string;
        jsdom?: object;
        media?: string[];
        report?: boolean;
        strictSSL?: boolean;
        timeout?: number;
        uncssrc?: string;
        userAgent?: string;
    };
    sortAttributes?: boolean | 'alphabetical' | 'frequency';
    sortAttributesWithLists?: boolean | 'alphabetical' | 'frequency';
}
type HtmlnanoModuleAttrsHandler = (attrs: Record<string, string | boolean | void>, node: PostHTML.Node) => Record<string, string | boolean | void>;
type HtmlnanoModuleContentHandler = (content: Array<PostHTMLNodeLike>, node: PostHTML.Node) => MaybeArray<PostHTMLNodeLike>;
type HtmlnanoModuleNodeHandler = (node: PostHTMLNodeLike) => PostHTML.Node | string;
type OptionalOptions<T> = T extends boolean | string | Function | number | null | undefined ? T : T extends object ? Partial<T> : T;
type HtmlnanoModule<Options = any> = {
    onAttrs?: (options: Partial<HtmlnanoOptions>, moduleOptions: OptionalOptions<Options>) => HtmlnanoModuleAttrsHandler;
    onContent?: (options: Partial<HtmlnanoOptions>, moduleOptions: OptionalOptions<Options>) => HtmlnanoModuleContentHandler;
    onNode?: (options: Partial<HtmlnanoOptions>, moduleOptions: OptionalOptions<Options>) => HtmlnanoModuleNodeHandler;
    default?: (tree: PostHTMLTreeLike, options: Partial<HtmlnanoOptions>, moduleOptions: OptionalOptions<Options>) => PostHTMLTreeLike | Promise<PostHTMLTreeLike>;
};

type CustomModule = (tree: PostHTMLTreeLike, options: Partial<HtmlnanoOptions>) => PostHTMLTreeLike;
declare const mod: HtmlnanoModule<CustomModule[]>;

export { mod as default };
