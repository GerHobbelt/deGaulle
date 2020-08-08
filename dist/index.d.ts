declare const nomnom: any;
declare const MarkDown: any;
declare const mdPluginCollective: any;
declare const pkg: any;
declare const jsdom: any;
declare const JSDOM: any;
declare const glob: any;
declare const gitignoreParser: any;
declare const assert: any;
declare const _: any;
declare const path: any;
declare const fs: any;
declare let DEBUG: number;
declare const markdownTokens: {};
interface ResultFileRecord {
    path: string;
    nameLC: string;
    ext: string;
    relativePath: string;
    destinationRelPath: string;
}
interface ResultHtmlFileRecord extends ResultFileRecord {
    HtmlContent: string;
    HtmlHeadContent: string;
    HtmlBody: any;
    HtmlHead: any;
}
declare type ResultTextAssetFileRecord = ResultFileRecord;
declare type ResultBinaryAssetFileRecord = ResultFileRecord;
interface ResultsCollection {
    markdown: Map<string, ResultHtmlFileRecord>;
    html: Map<string, ResultHtmlFileRecord>;
    css: Map<string, ResultTextAssetFileRecord>;
    js: Map<string, ResultTextAssetFileRecord>;
    image: Map<string, ResultBinaryAssetFileRecord>;
    movie: Map<string, ResultBinaryAssetFileRecord>;
    misc: Map<string, ResultBinaryAssetFileRecord>;
    _: Map<string, ResultBinaryAssetFileRecord>;
}
interface ConfigRecord {
    docTreeBasedir: string;
    destinationPath: string;
    outputDirRelativePath: string;
}
declare const config: ConfigRecord;
declare type getIncludeRootDirFn = (options: any, state: any, startLine: number, endLine: number) => string;
interface MarkdownItEnvironment {
    getIncludeRootDir: getIncludeRootDirFn;
}
declare function unixify(path: any): any;
declare function absSrcPath(rel: any): any;
declare function absDstPath(rel: any): any;
declare function readOptionalTxtConfigFile(rel: any): {};
declare function myCustomPageNamePostprocessor(spec: any): any;
declare function sanityCheck(opts: any, command: any): Promise<unknown>;
declare function buildWebsite(opts: any, command: any): Promise<void>;
declare function compileMD(mdPath: any, md: any, allFiles: any): Promise<unknown>;
declare function loadHTML(htmlPath: any, allFiles: any): Promise<unknown>;
declare function loadFixedAssetTextFile(filePath: any, allFiles: any, collection: any): Promise<unknown>;
declare function loadFixedAssetBinaryFile(filePath: any, allFiles: any, collection: any): Promise<unknown>;
declare function cleanTokensForDisplay(tokens: any): any[];
declare function cleanSingleTokenForDisplay(token: any): {};
declare function mdGenerated(pagePaths: any): Promise<void>;
declare function traverseTokens(tokens: any, cb: any, depth?: number): void;
