//
//
//

import nomnom from '@gerhobbelt/nomnom';

import MarkDown from '@gerhobbelt/markdown-it';

import mdPluginCollective from 'markdown-it-dirty-dozen';

import { fileURLToPath } from 'url';

// see https://nodejs.org/docs/latest-v13.x/api/esm.html#esm_no_require_exports_module_exports_filename_dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.normalize(path.join(__dirname, '../package.json')), 'utf8'));

import jsdom from 'jsdom';
const { JSDOM } = jsdom;
import glob from '@gerhobbelt/glob';
import gitignoreParser from '@gerhobbelt/gitignore-parser';
import assert from 'assert';
import _ from 'lodash';

import path from 'path';
import fs from 'fs';

let DEBUG = 1;

const markdownTokens: Record<string, boolean> = {};

interface ResultFileRecord {
  path: string;
  nameLC: string;
  ext: string;
  relativePath: string;
  destinationRelPath: string;
  RawContent: any;
  contentIsBinary: boolean;
}
interface ResultHtmlFileRecord extends ResultFileRecord {
  HtmlContent: string;
  docTitle: string;
  HtmlHeadContent: string;
  //HtmlBody: any;
  //HtmlHead: any;
  metaData: any;
}
type ResultTextAssetFileRecord = ResultFileRecord
type ResultBinaryAssetFileRecord = ResultFileRecord
interface ResultsCollection {
  markdown: Map<string, ResultHtmlFileRecord>;
  html: Map<string, ResultHtmlFileRecord>;
  css: Map<string, ResultTextAssetFileRecord>;
  js: Map<string, ResultTextAssetFileRecord>;
  image: Map<string, ResultBinaryAssetFileRecord>;
  movie: Map<string, ResultBinaryAssetFileRecord>;
  archive: Map<string, ResultBinaryAssetFileRecord>;
  distro: Map<string, ResultBinaryAssetFileRecord>;
  misc: Map<string, ResultBinaryAssetFileRecord>;
  _: Map<string, ResultBinaryAssetFileRecord>;
}
interface ConfigRecord {
  docTreeBasedir: string;
  destinationPath: string;
  outputDirRelativePath: string;
}

const config: ConfigRecord = {
  docTreeBasedir: null,
  destinationPath: null,
  outputDirRelativePath: null
};

type getIncludeRootDirFn = (options: any, state: any, startLine: number, endLine: number) => string;
interface MarkdownItEnvironment {
  getIncludeRootDir: getIncludeRootDirFn;
  title: string | null;
}


export default function main() {
  nomnom.script('deGaulle');

  nomnom
    .command('build')
    .option('debug', {
      abbr: 'd',
      flag: false,
      'default': 0,
      help: 'Print debugging info'
    })
    .option('config', {
      abbr: 'c',
      'default': 'config.js',
      help: 'JS script file with custom handlers'
    })
    .option('output', {
      abbr: 'o',
      flag: false,
      help: 'directory to write results to'
    })
    .callback(function (opts, cmd) {
      try {
        buildWebsite(opts, cmd);
      } catch (ex) {
        console.error(`ERROR: ${ex.message}\n\nException:\n${ex}`);
        process.exit(5);
      }
    })
    .help('build website from sources');

  nomnom
    .command('sanity')
    .option('debug', {
      abbr: 'd',
      flag: false,
      help: 'Print debugging info'
    })
    .option('config', {
      abbr: 'c',
      'default': 'config.js',
      help: 'JS script file with custom handlers'
    })
    .option('outfile', {
      abbr: 'o',
      help: 'file to write results to'
    })
    .callback(function (opts, cmd) {
      try {
        sanityCheck(opts, cmd);
      } catch (ex) {
        console.error(`ERROR: ${ex.message}\n\nException:\n${ex}`);
        process.exit(5);
      }
    })
    .help('run the sanity tests');

  nomnom
    .nocommand()
    .option('debug', {
      abbr: 'd',
      flag: false,
      'default': 0,
      help: 'Print debugging info'
    })
    .option('config', {
      abbr: 'c',
      'default': 'config.js',
      help: 'JS script file with custom drivers'
    })
    .option('version', {
      flag: true,
      help: 'print version and exit',
      callback: function () {
        return `version ${pkg.version}`;
      }
    })
    .callback(function (opts, cmd) {
      try {
        buildWebsite(opts, cmd);
      } catch (ex) {
        console.error(`ERROR: ${ex.message}\n\nException:\n${ex}`);
        process.exit(5);
      }
    });

  nomnom.parse();
}



// -- done --



function unixify(path) {
  return path.replace(/\\/g, '/');
}

function absSrcPath(rel) {
  const p = path.join(config.docTreeBasedir, rel);
  return unixify(path.resolve(p));
}

function absDstPath(rel) {
  if (!config.destinationPath) {
    throw new Error('Internal error: used too early');
  }
  const p = path.join(config.destinationPath, rel);
  return unixify(path.resolve(p));
}

const SANE_MAX_STRING_LENGTH = 2 * 120;

function limitDebugOutput(str) {
  if (str && str.length > SANE_MAX_STRING_LENGTH) {
    str = `${str.slice(0, SANE_MAX_STRING_LENGTH - 20)}...\n  ... (length: ${str.length})`;
  }
  return str;
}

function limitDebugOutput4Map(collection) {
  if (collection instanceof Map) {
    const rv = new Map();

    collection.forEach((value, key) => {
      rv.set(key, showRec(value));
    });
    return rv;
  }
  return collection;
}
function limitDebugOutput4Collection(allFiles: ResultsCollection) {
  if (allFiles) {
    const rv = {
    };

    for (const type in allFiles) {
      const m = allFiles[type];
      rv[type] = limitDebugOutput4Map(m);
    }
    return rv;
  }
  return allFiles;
}

function showRec(rec) {
  if (rec) {
    const rv = Object.assign({}, rec);
    for (const key in rv) {
      const attr = rv[key];
      if (typeof attr === 'string' && attr.length > SANE_MAX_STRING_LENGTH) {
        rv[key] = limitDebugOutput(attr);
      }
    }
    return rv;
  }
  return rec;
}

function readOptionalTxtConfigFile(rel) {
  const p = absSrcPath(rel);
  if (fs.existsSync(p)) {
    const src = fs.readFileSync(p, 'utf8');
    // - split into lines
    // - filter out any lines which don't have an '='
    // - split each line across the initial '=' in there.
    // - turn this into a hash table?
    const lines = src.split(/[\r\n]/g);
    const linesarr = lines.filter((l) => l.trim().length > 1 && l.includes('=')).map((l) => {
      let parts = l.split('=');
      if (parts.length !== 2) {
        throw new Error(`config line in ${rel} is expected to have only one '='`);
      }
      parts = parts.map((l) => l.trim());
      return parts;
    });
    const rv = {};
    linesarr.forEach((l) => {
      rv[l[0]] = l[1];
    });
    return rv;
  }
  return {};
}

function myCustomPageNamePostprocessor(spec) {
  // clean up unwanted characters
  spec = spec.replace(/ :: /g, '/');
  spec = spec.replace(/ --* /g, '/');
  spec = _.deburr(spec).trim();
  // // normalize case
  //spec = spec.toLowerCase();
  spec = spec
      .replace(/[^\w\d\s\/_-]/g, '_');
  spec = spec
      .replace(/__+/g, '_');
  spec = spec
      .replace(/\s+/g, ' ');
  if (DEBUG >= 7) console.log('myCustomPageNamePostprocessor STAGE 1', spec);
  spec = spec
      .replace(/_-_/g, '_');
  spec = spec
      .replace(/ - /g, ' ');
  spec = spec
      .replace(/[ _]* [ _]*/g, ' ');
  if (DEBUG >= 7) console.log('myCustomPageNamePostprocessor STAGE 2', spec);
  spec = spec
      .replace(/(^|\/)[ _]+/g, '$1');
  spec = spec
      .replace(/[ _]+($|\/)/g, '$1');
  if (DEBUG >= 7) console.log('myCustomPageNamePostprocessor STAGE 3', spec);
  spec = spec
      .replace(/ /g, '_');
  if (DEBUG >= 7) console.log('myCustomPageNamePostprocessor STAGE 4', spec);

  return spec;
}

async function loadConfigScript(configScript) {
  if (configScript) {
    // https://stackoverflow.com/questions/42453683/how-to-reject-in-async-await-syntax
    if (DEBUG >= 1)  console.log(`loadConfigScript(${configScript})`);
    if (!path.isAbsolute(configScript)) {
      // make sure `import` sees a './'-based relative path, or it barf a hairball as it will treat the base directory as a package identifier instead!
      configScript = unixify(path.join(process.cwd(), configScript));
    }
    if (DEBUG >= 1)  console.log(`loadConfigScript(prepped: '${configScript}')`);
    try {
      const processors = await import('file://' +  configScript);
      return processors;
    } catch (err) {
      console.error('######## ERROR: ', err);
      //throw new AggregateError([ err ], `Cannot open/load config script file '${configScript}'`);
      throw new Error(`Cannot open/load config script file '${configScript}'. Error: ${err}`);
    }
  } else {
    return new Promise((resolve, reject) => {
      const processors = {};
      resolve(processors);
    });
  }
}

async function sanityCheck(opts, command) {
  console.log(
    `sanityCheck: command: ${command || '<no-command>'}, opts: ${JSON.stringify(
      opts,
      null,
      2
    )}`
  );

  DEBUG = Math.max(DEBUG, Number.isFinite(+opts.debug) ? +opts.debug : opts.debug ? 1 : 0);
  console.log('DEBUG = ', DEBUG);

  return new Promise((resolve, reject) => {
    resolve(0);
  });
}


async function buildWebsite(opts, command) {
  console.log(
    `buildWebsite: command: ${command || '<no-command>'}, opts: ${JSON.stringify(
      opts,
      null,
      2
    )}`
  );

  DEBUG = Math.max(DEBUG, Number.isFinite(+opts.debug) ? +opts.debug : opts.debug ? 1 : 0);
  console.log('DEBUG = ', DEBUG);

  const paths = opts._.slice(command ? 1 : 0);
  const minPathsCount = 1;

  if (!paths || paths.length < minPathsCount) {
    throw new Error(
      'Must specify at least one file path as starting point. None were specified.'
    );
  }

  // load the config script, iff it exists:
  const configScript = opts.config;

  let processors = null;
  try {
    processors = await loadConfigScript(configScript);
  } catch (err) {
    console.error('##### ERROR while importing config script. (Will continue with a default script.)\nError: ', err);
    processors = await loadConfigScript(null);
  }

  let firstEntryPointPath = paths[0];
  // make sure we start with an absolute path; everything will derived off this one.
  if (!path.isAbsolute(firstEntryPointPath)) {
    firstEntryPointPath = path.join(process.cwd(), firstEntryPointPath);
  }
  firstEntryPointPath = unixify(path.normalize(firstEntryPointPath));
  if (DEBUG >= 1) console.log('firstEntryPointPath = ', firstEntryPointPath);

  let entryStats = fs.lstatSync(firstEntryPointPath);

  if (entryStats && entryStats.isDirectory()) {
    // check if any of the default entry points exist:
    // - index.md
    // - index.html
    // - README.md
    let indexFile;
    let indexFilePriority = 0;
    let scanPath = path.join(firstEntryPointPath, '*.{md,htm,html}');
    scanPath = unixify(scanPath);
    if (DEBUG >= 1) console.log('scanPath:', scanPath);
    const files = glob.sync(scanPath, {
      nosort: true,
      nomount: true,
      nounique: false,
      nocase: true,     //<-- uncomment this one for total failure to find any files >:-((
      nodir: true,
      nobrace: false,
      gitignore: true
    });
    if (DEBUG >= 3) console.log(`root point DIR --> scan: ${JSON.stringify(files, null, 2)}`);

    const filelist = files || [];
    for (const f of filelist) {
      if (DEBUG >= 10) console.log('Loop!', { f });
      const basename = path.basename(f.toLowerCase());
      if (DEBUG >= 7) console.log('Can this serve as root?', basename);
      switch (basename) {
      case 'index.md':
        if (indexFilePriority < 10) {
          indexFilePriority = 10;
          indexFile = f;
        }
        break;

      case 'index.htm':
      case 'index.html':
        if (indexFilePriority < 5) {
          indexFilePriority = 5;
          indexFile = f;
        }
        break;

      case 'readme.md':
        if (DEBUG >= 7) console.log('Hit!', basename);
        if (indexFilePriority < 1) {
          indexFilePriority = 1;
          indexFile = f;
        }
        if (DEBUG >= 7) console.log('Continue!', indexFile);
        break;

      default:
        if (DEBUG >= 1) console.log('WUT?!', basename);
        break;
      }
    }
    if (DEBUG >= 10) console.log('Loop end!', indexFile);

    if (DEBUG >= 3) console.log('root scan -> indexFile', indexFile);
    if (indexFile) {
      firstEntryPointPath = unixify(path.resolve(indexFile));
      if (DEBUG >= 1) console.log('root scan -> firstEntryPointPath', firstEntryPointPath);
      entryStats = fs.lstatSync(firstEntryPointPath);
    } else {
      throw new Error(
        `Could not find a default entry point file (index.md, index.html or README.md) in the entry point directory ${firstEntryPointPath} (${scanPath})`
      );
    }
  }

  if (!entryStats) {
    throw new Error(`entry point does not exist: ${firstEntryPointPath}`);
  }

  if (!entryStats.isFile()) {
    throw new Error(`entry point is not a file: ${firstEntryPointPath}`);
  }

  config.docTreeBasedir = path.dirname(firstEntryPointPath);

  let outputDirPath = paths[1] || path.join(config.docTreeBasedir, (!config.docTreeBasedir.endsWith('docs') ? '../docs' : '../' + path.basename(config.docTreeBasedir) + '-output'));
  // make sure we start with an absolute path; everything will derived off this one.
  if (!path.isAbsolute(outputDirPath)) {
    outputDirPath = path.join(process.cwd(), outputDirPath);
  }
  outputDirPath = unixify(path.normalize(outputDirPath));
  if (DEBUG >= 1) console.log('outputDirPath = ', outputDirPath);
  config.destinationPath = outputDirPath;

  config.outputDirRelativePath = unixify(path.relative(config.docTreeBasedir, config.destinationPath));

  if (DEBUG >= 2) console.log('config:', config);


  const rv_mapping_def = {
    markdown: [
      'md',
      'markdown'
    ],
    html: [
      'html',
      'htm'
    ],
    js: [
      'js',
      'mjs',
      'ejs',
      'cjs',
      'ts',
      'coffee'
    ],
    css: [
      'css',
      'scss',
      'less',
      'styl',
      'stylus'
    ],
    image: [
      'png',
      'gif',
      'jpg',
      'jpeg',
      'tiff',
      'bmp',
      'svg',
      'psd',
      'ai',
      'webp'
    ],
    movie: [
      'mkv',
      'mp4',
      'avi',
      'mov',
      'flv',
      'webm'
    ],
    archive: [
      'zip',
      'rar',
      'gz',
      'bz2',
      '7z'
    ],
    distro: [
      'exe',
      'msi'
    ]
  };
  const rv_mapping_bin_content = {
    png: true,
    gif: true,
    jpg: true,
    jpeg: true,
    tiff: true,
    bmp: true,
    svg: false,
    psd: true,
    ai: true,
    mkv: true,
    mp4: true,
    avi: true,
    mov: true,
    flv: true,
    webm: true,
    webp: true,
    zip: true,
    rar: true,
    gz: true,
    bz2: true,
    '7z': true,
    exe: true,
    msi: true
  };
  const rv_mapping = new Map();
  for (const n in rv_mapping_def) {
    const a = rv_mapping_def[n];
    if (DEBUG >= 4) console.log('key n', { n, a });
    for (const b of a) {
      if (DEBUG >= 4) console.log('map n -> b', { n, b });
      rv_mapping.set('.' + b, n);
    }
  }

  if (DEBUG >= 3) console.log('######################### mapping ##########################\n', rv_mapping, '\n###########################################');



  // now scan the entire tree: collect potential files for comparison & treatment
  //
  // Produces an array of categories, which each are an array of file records,
  // where each file record has this format:
  //
  // {
  //   path,        -- full path to file
  //   nameLC       -- lowercased filename
  //   ext          -- lowercased filename extension
  //   relativePath --  relative path to config.docTreeBasedir
  // }
  //
  async function collectAllFiles() : Promise<ResultsCollection> {
    let scanPath = path.join(config.docTreeBasedir, '**/*');
    scanPath = unixify(scanPath);
    if (DEBUG >= 1) console.log('scanPath:', scanPath);

    return new Promise((resolve, reject) => {
      glob(scanPath, {
        nosort: true,
        nomount: true,
        nounique: false,
        nocase: true,     //<-- uncomment this one for total failure to find any files >:-((
        nodir: true,
        nobrace: false,
        gitignore: true
      }, function processGlobResults(err, files) {
        if (err) {
          reject(new Error(`glob scan error: ${err}`));
          return;
        }

        if (DEBUG >= 1) console.log(`root point DIR --> scan: ${JSON.stringify(files, null, 2)}`);

        const rv: ResultsCollection = {
          markdown: new Map(),
          html: new Map(),
          css: new Map(),
          js: new Map(),
          image: new Map(),
          movie: new Map(),
          archive: new Map(),
          distro: new Map(),
          misc: new Map(),
          _: new Map()
        };

        for (const p of files || []) {
          AddFileToCollection(p, rv);
        }
        resolve(rv);
      });
    });
  }

  function AddFileToCollection(p, collection) {
    const f = unixify(path.resolve(p));
    if (DEBUG >= 9) console.log('hacky fix for glob output not being abs path on Windows:', { 'in': p, out: f });
    const fname = path.basename(f);

    // check if the file is to be ignored:
    let ignore = false;

    [ 'CNAME', '.nojekyll', /\.vcxproj/, /^site-builder\./, /^Makefile$/ ].forEach((f) => {
      if (typeof f === 'string' && f === fname) {
        ignore = true;
      } else if (f instanceof RegExp && f.test(fname)) {
        ignore = true;
      }
    });

    if (!ignore) {
      const ext = path.extname(fname).toLowerCase();
      const el: ResultFileRecord = {
        path: f,
        nameLC: fname.toLowerCase(),
        ext: ext,
        relativePath: unixify(path.relative(config.docTreeBasedir, f)),
        destinationRelPath: null,
        RawContent: null,
        contentIsBinary: rv_mapping_bin_content[ext] || false
      };
      const cat = rv_mapping.get(ext) || 'misc';
      collection[cat].set(f, el);
      collection._.set(f, el);
    } else {
      console.log(`INFO: Ignoring file '${f}'.`);
    }
  }


  // async invocation, but don't wait for it yet:
  const scan = collectAllFiles();

  const md = MarkDown({
    // Enable HTML tags in source
    html: true,
    // Use '/' to close single tags (<br />).
    xhtmlOut: false,
    // Convert '\n' in paragraphs into <br>
    breaks: false,
    // CSS language prefix for fenced blocks. Can be useful for external highlighters.
    langPrefix: 'language-',
    // Autoconvert URL-like text to links
    linkify: true,
    // highSecurity:
    // - false:           lower protection against XSS/Unicode-Homologue/etc. attacks via the input MarkDown.
    //                    This setting assumes you own or at least trust the Markdown
    //                    being fed to MarkDonw-It. The result is a nicer render.
    // - true (default):  maximum protection against XSS/Unicode-Homologue/etc. attacks via the input MarkDown.
    //                    This is the default setting and assumes you have no control or absolute trust in the Markdown
    //                    being fed to MarkDonw-It. Use this setting when using markdown-it as part of a forum or other
    //                    website where more-or-less arbitrary users can enter and feed any MarkDown to markdown-it.
    //
    // See https://en.wikipedia.org/wiki/Internationalized_domain_name for details on homograph attacks, for example.
    highSecurity: false,
    // Enable some language-neutral replacement + quotes beautification
    typographer: true,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: '“”‘’',
    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externally.
    // If result starts with <pre... internal wrapper is skipped.
    highlight: function () /*str, lang*/
    {
      console.error('highligh callback invoked!');
      return '';
    } // Configure default attributes for given tags
    //default_attributes: { a: [['rel', 'nofollow']] }
  });

  // augment the md instance for use with the markdown_it_include plugin:
  //md.getIncludeRootDir = ...

  if (DEBUG >= 2) console.log('setting up markdown-it:', mdPluginCollective, typeof mdPluginCollective.use_dirty_dozen);
  mdPluginCollective.use_dirty_dozen(md, {
    abbr: {
      abbreviations: readOptionalTxtConfigFile('.deGaulle/abbr-abbreviations.txt'),
      links:         readOptionalTxtConfigFile('.deGaulle/abbr-links.txt'),
      emphasis:      readOptionalTxtConfigFile('.deGaulle/abbr-emphasis-phrases.txt')
    },

    include: {
      root: '/includes/',
      getRootDir: (options, state, startLine, endLine) => state.env.getIncludeRootDir(options, state, startLine, endLine)
    },

    wikilinks: {
      postProcessPageName: function (pageName) {
        const rv = myCustomPageNamePostprocessor(pageName);
        if (DEBUG >= 2) console.log('wikilink transform:', { 'in': pageName, out: rv });
        return rv;
      }
    }
  });

  const allFiles: ResultsCollection = await scan;
  if (DEBUG >= 4) console.log('!!!!!!!!!!!!!!!! allFiles:', limitDebugOutput4Collection(allFiles));

  if (!allFiles.markdown.get(firstEntryPointPath) && !allFiles.html.get(firstEntryPointPath)) {
    throw new Error(`root file '${firstEntryPointPath}' is supposed to be part of the website`);
  }


  if (0) {
    console.log(`processing root file: ${firstEntryPointPath}...`);
    const specRec = await compileMD(firstEntryPointPath, md, allFiles);

    if (DEBUG >= 10) console.log('specRec:', showRec(specRec));
  }

  console.log('processing/loading site files...');

  // now process the HTML, MD, CSS, JS and other 'fixed assets' files:
  //
  // [css, js, image, movie, misc, _]
  for (const type in allFiles) {
    switch (type) {
    case 'markdown':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          // as these pages will be rendered to HTML, they'll receive the html extension:
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
          if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! markdown file record:', showRec(entry));

          const specRec2 = await compileMD(key, md, allFiles);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    case 'html':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          // It doesn't matter whether these started out as .htm or .html files: we output them as .html files anyway:
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
          if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! HTML file record:', showRec(entry));

          const specRec2 = await loadHTML(key, allFiles);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    case 'css':
    case 'js':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, showRec(entry));

          const specRec2 = await loadFixedAssetTextFile(key, allFiles, collection);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    default:
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, showRec(entry));

          const specRec2 = await loadFixedAssetBinaryFile(key, allFiles, collection);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;
    }
  }

  // now's the time to match the links in the generated content and do some linkage reporting alongside:
  //
  if (DEBUG >= 2) console.log('>>>>>>>>>>>>>>>>>>>> allFiles:', limitDebugOutput4Collection(allFiles));
  if (DEBUG >= 1) console.log('markdown AST token types:', Object.keys(markdownTokens).sort());





  console.log('tracing site files...');

  // now trace the access graph:
  //
  // [css, js, image, movie, misc, _]
  for (const type in allFiles) {
    switch (type) {
    case 'markdown':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          // as these pages will be rendered to HTML, they'll receive the html extension:
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
          if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! markdown file record:', showRec(entry));

          const specRec2 = await compileMD(key, md, allFiles);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    case 'html':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          // It doesn't matter whether these started out as .htm or .html files: we output them as .html files anyway:
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
          if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! HTML file record:', showRec(entry));

          const specRec2 = await loadHTML(key, allFiles);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    case 'css':
    case 'js':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, showRec(entry));

          const specRec2 = await loadFixedAssetTextFile(key, allFiles, collection);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    default:
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, showRec(entry));

          const specRec2 = await loadFixedAssetBinaryFile(key, allFiles, collection);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;
    }
  }










  console.log('updating/patching site files...');

  // now patch links, etc. in the HTML, MarkDown, CSS and JS files:
  //
  // [css, js, image, movie, misc, _]
  for (const type in allFiles) {
    switch (type) {
    case 'markdown':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          // as these pages will be rendered to HTML, they'll receive the html extension:
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
          if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! markdown file record:', showRec(entry));

          const specRec2 = await compileMD(key, md, allFiles);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    case 'html':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          // It doesn't matter whether these started out as .htm or .html files: we output them as .html files anyway:
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
          if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! HTML file record:', showRec(entry));

          const specRec2 = await loadHTML(key, allFiles);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    case 'css':
    case 'js':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, showRec(entry));

          const specRec2 = await loadFixedAssetTextFile(key, allFiles, collection);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    default:
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, showRec(entry));

          const specRec2 = await loadFixedAssetBinaryFile(key, allFiles, collection);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;
    }
  }















  console.log('rendering site files\' content...');

  // render the HTML, MarkDown, CSS and JS files' content:
  //
  // [css, js, image, movie, misc, _]
  for (const type in allFiles) {
    switch (type) {
    case 'markdown':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          // as these pages will be rendered to HTML, they'll receive the html extension:
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
          if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! markdown file record:', showRec(entry));

          const specRec2 = await compileMD(key, md, allFiles);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    case 'html':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          // It doesn't matter whether these started out as .htm or .html files: we output them as .html files anyway:
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
          if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! HTML file record:', showRec(entry));

          const specRec2 = await loadHTML(key, allFiles);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    case 'css':
    case 'js':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, showRec(entry));

          const specRec2 = await loadFixedAssetTextFile(key, allFiles, collection);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;

    default:
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, showRec(entry));

          const specRec2 = await loadFixedAssetBinaryFile(key, allFiles, collection);

          if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
          assert.strictEqual(specRec2, entry);
        }
      }
      continue;
    }
  }





  //
  // Apply the template? Nah, that must have already happened in the render phase.
  // If we have special 'generated content only' pages, such as the index page to a catalog site,
  // that *still* is done through a (possibly empty, except for some metadata perhaps) `index.html`
  // or README.md or other *content* file: the custom code can decide which bit of the template
  // collective to apply to each page, so that would then apply a 'overview/index/landing' page
  // template to such a (hypothetical) page.
  //
  // Hence we come to the conclusion now: every page being written is written by a (possibly empty)
  // content page. If the content page is absent, the page simply is NOT generated.
  //
  // Meanwhile, the custom code decides which template file((s) are applied to each content item
  // in the allFiles list.
  //
  // ---
  //
  // Yes, this means we'll have content pages for the 404 and other landing pages too. If they are
  // absent, we do not have those landing pages. Simple as that.
  //






  // output the files into the destination directory
  console.log(
    `buildWebsite: command: ${command || '<no-command>'}, opts: ${JSON.stringify(
      opts,
      null,
      2
    )}`
  );

  // now write the CSS, HTML, JS and other files:
  if (DEBUG >= 1) console.log(`Writing all processed & collected files to the website destination directory '${config.docTreeBasedir}'...`);

  for (const type in allFiles) {
    switch (type) {
    case '_':
      continue;

    case 'html':
    case 'markdown':
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key = slot[0];
          const entry = slot[1];
          const destFilePath = unixify(path.join(opts.output, entry.destinationRelPath));
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record: copy '${entry.path}' --> '${destFilePath}'`);

          let title = entry.docTitle;
          if (title && title.trim()) {
            title = `<title>${title}</title>`;
          } else {
            title = '';
          }
          const miscHeaderContent = entry.HtmlHeadContent || '';
          const bodyContent = entry.HtmlContent;
          const originalPath = entry.relativePath;

          const content = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${ title }
    ${ miscHeaderContent }
  </head>
  <body>

    ${ bodyContent }

    <footer>
      © 2020 Qiqqa Contributors ::
      <a href="https://github.com/GerHobbelt/qiqqa-open-source/blob/docs-src/${ originalPath }">Edit this page on GitHub</a>
    </footer>
  </body>
</html>
`.trimLeft();

          const dstDir = unixify(path.dirname(destFilePath));
          fs.mkdirSync(dstDir, { recursive: true });
          fs.writeFileSync(destFilePath, content, 'utf8');
          //el.HtmlContent = content;
          //el.HtmlHeadContent = headEl.innerHTML;
          //el.HtmlBody = bodyEl;
          //el.HtmlHead = headEl;
        }
      }
      continue;

    case 'css':
    case 'js':
    default:
      {
        const collection = allFiles[type];
        for (const slot of collection) {
          const key: string = slot[0];
          const entry: ResultFileRecord = slot[1];
          const destFilePath = unixify(path.join(opts.output, entry.destinationRelPath));
          if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record: copy '${entry.path}' --> '${destFilePath}'`);

          const dstDir = unixify(path.dirname(destFilePath));
          fs.mkdirSync(dstDir, { recursive: true });
          fs.copyFileSync(entry.path, destFilePath, fs.constants.COPYFILE_FICLONE);
        }
      }
      continue;
    }
  }

  if (DEBUG >= 1) console.log(`Copying the extra files to the website destination directory '${config.docTreeBasedir}'...`);

  // add a couple of important files, which are probably not included in the file list yet:
  [ 'CNAME', '.nojekyll' ].forEach((f) => {
    const p = unixify(path.resolve(path.join(config.docTreeBasedir, f)));
    if (fs.existsSync(p)) {
      const destFilePath = unixify(path.join(opts.output, f));

      const dstDir = unixify(path.dirname(destFilePath));
      fs.mkdirSync(dstDir, { recursive: true });
      fs.copyFileSync(p, destFilePath, fs.constants.COPYFILE_FICLONE);
    }
  });
}



// compile the MarkDown files to a token stream. Belay *rendering* until all files, including the HTML files out there,
// have been processed as we will be patching some tokens in there before the end is neigh!
async function compileMD(mdPath, md, allFiles) {
  if (DEBUG >= 3) console.log(`processing file: ${mdPath}...`);

  return new Promise((resolve, reject) => {
    fs.readFile(
      mdPath,
      {
        encoding: 'utf8'
      },
      async (err, data) => {
        if (err) {
          reject(new Error(
            `ERROR: read error ${err} for file ${mdPath}`
          ));
          return;
        }

        const env : MarkdownItEnvironment = {
          getIncludeRootDir: null,
          title: null
        };

        if (DEBUG >= 8) console.log(`source: length: ${data.length}`);

        // augment the md instance for use with the markdown_it_include plugin:
        env.getIncludeRootDir = function (options, state, startLine, endLine) {
          if (DEBUG >= 6) console.log('##### include root dir is today:', { dir: path.dirname(mdPath) });
          return path.dirname(mdPath);
        };

        // let content = md.render(data); --> .parse + .renderer.render
        //
        // .parse --> new state + process: return tokens
        // let tokens = md.parse(data, env)
        const state = new md.core.State(data, md, env);
        md.core.process(state);
        const tokens = state.tokens;
        const metadata = {
          frontMatter: null,
          docTitle: null
        };

        if (DEBUG >= 10) console.log('tokens:\n', limitDebugOutput(JSON.stringify(cleanTokensForDisplay(tokens), null, 2)));

        const typeMap = new Set();
        traverseTokens(tokens, (t, idx, arr, depth) => {
          typeMap.add(t.type);
          markdownTokens[t.type] = true;

          if (t.type === 'front_matter') {
            metadata.frontMatter = t.meta;
          }
        });
        if (DEBUG >= 4) console.log('token types:', typeMap);

        if (0) {
          let position = 0;
          let prevToken = null;
          traverseTokens(tokens, (t, idx, arr, depth) => {
            if (!Number.isFinite(t.position)) {
              console.error('erroneous token position:', t);
              return;
            }
            if (!Number.isFinite(t.size)) {
              console.error('erroneous token size:', t);
              return;
            }
            if (t.position >= position) {
              position = t.position;
            } else {
              console.warn('token position is dropping back / reversing:', { position, t, prevToken });
            }
            prevToken = t;
          });
        }

        if (!env.title) {
          metadata.docTitle = env.title;
        }

        const content = md.renderer.render(tokens, md.options, env);

        if (DEBUG >= 4) console.log('output:\n', limitDebugOutput(content));

        const dom = new JSDOM('<html><head>\n' + content,
          { includeNodeLocations: true }
        );

        const document = dom.window.document;
        const bodyEl = document.body; // implicitly created
        const headEl = document.querySelector('head');
        if (DEBUG >= 5) console.log('MARKDOWN:\n', showRec({ html: document, body: bodyEl.innerHTML, head: headEl.innerHTML }));

        // update the file record:
        const el = allFiles.markdown.get(mdPath);
        if (DEBUG >= 3) console.log('update the file record:', { mdPath, el: showRec(el) });
        el.HtmlContent = content;
        //el.HtmlContent = bodyEl.innerHTML;
        el.HtmlHeadContent = headEl.innerHTML;
        //el.HtmlBody = bodyEl;
        //el.HtmlHead = headEl;
        el.metaData = metadata;

        resolve(el);
      }
    );
  });
}



// compile the HTML files to a DOM token stream. Belay *rendering* until all files, including the MarkDown files out there,
// have been processed as we will be patching some DOM nodes in there before the end is neigh!
async function loadHTML(htmlPath, allFiles) {
  if (DEBUG >= 3) console.log(`processing file: ${htmlPath}...`);

  return new Promise((resolve, reject) => {
    fs.readFile(
      htmlPath,
      {
        encoding: 'utf8'
      },
      async (err, data) => {
        if (err) {
          reject(new Error(
            `ERROR: read error ${err} for file ${htmlPath}`
          ));
          return;
        }

        if (DEBUG >= 8) console.log(`source: length: ${data.length}`);

        const dom = new JSDOM(data,
          { includeNodeLocations: true }
        );

        const document = dom.window.document;
        const bodyEl = document.body; // implicitly created
        const headEl = document.querySelector('head');
        const titleEl = headEl && headEl.querySelector('title');
        const title = titleEl && titleEl.innerHTML;

        if (DEBUG >= 3) console.log('HTML:\n', showRec({ html: document, body: bodyEl.innerHTML, head: headEl.innerHTML }));

        // update the file record:
        const el = allFiles.html.get(htmlPath);
        el.HtmlContent = bodyEl.innerHTML;
        el.HtmlHeadContent = headEl.innerHTML;
        //el.HtmlBody = bodyEl;
        //el.HtmlHead = headEl;

        el.metaData = {
          docTitle: title
        };

        resolve(el);
      }
    );
  });
}

async function loadFixedAssetTextFile(filePath, allFiles, collection) {
  if (DEBUG >= 3) console.log(`processing file: ${filePath}...`);

  return new Promise((resolve, reject) => {
    fs.readFile(
      filePath,
      {
        encoding: 'utf8'
      },
      async (err, data) => {
        if (err) {
          reject(new Error(
            `ERROR: read error ${err} for file ${filePath}`
          ));
          return;
        }

        if (DEBUG >= 8) console.log(`source: length: ${data.length}`);

        // update the file record:
        const el = collection.get(filePath);
        el.RawContent = data;

        resolve(el);
      }
    );
  });
}

async function loadFixedAssetBinaryFile(filePath, allFiles, collection) {
  if (DEBUG >= 3) console.log(`processing file: ${filePath}...`);

  // We DO NOT load binary fgiles as that would only clutter the nodeJS heap memory and cause out-of-memory exceptions.
  return new Promise((resolve, reject) => {
    const x = fs.existsSync(filePath);
    if (!x) {
      reject(new Error(
        `ERROR: file '${filePath}' does not exist.`
      ));
      return;
    }

    //if (DEBUG >= 8) console.log(`source: length: ${data.length}`);

    // update the file record:
    const el = collection.get(filePath);
    //el.RawContent = data;
    el.contentIsBinary = true;

    resolve(el);
  });
}


function cleanTokensForDisplay(tokens) {
  const rv = [];
  for (const i in tokens) {
    let t = tokens[i];
    t = cleanSingleTokenForDisplay(t);
    if (t.children) {
      t.children = cleanTokensForDisplay(t.children);
    }
    rv[i] = t;
  }
  return rv;
}

function cleanSingleTokenForDisplay(token) {
  const rv = {};
  for (const attr in token) {
    if (token[attr] !== '' && token[attr] != null) {
      rv[attr] = token[attr];
    }
  }
  return rv;
}

// https://vuepress.vuejs.org/plugin/life-cycle.html#generated
async function mdGenerated(pagePaths) {
  // cp docs-src/.nojekyll docs/ && cp docs-src/CNAME docs/
  console.error('async generated HIT');

  fs.writeFileSync(absDstPath('CNAME'), 'qiqqa.org\n', 'utf8');

  fs.writeFileSync(absDstPath('.nojekyll'), '');
}

function traverseTokens(tokens, cb, depth?: number) {
  depth = depth || 0;
  for (let i = 0, len = tokens.length; i < len; i++) {
    const t = tokens[i];
    cb(t, i, tokens, depth);

    if (t.children) {
      traverseTokens(t.children, cb, depth + 1);
    }
  }
}


// demo()
//   .then(() => {
//      console.log('done');
//   })
//   .catch(err => {
//     console.error('error:', err);
//   });
