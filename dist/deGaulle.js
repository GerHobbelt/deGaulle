/*! deGaulle 1.0.0-1 https://github.com//GerHobbelt/deGaulle @license MIT */

import nomnom from '@gerhobbelt/nomnom';
import slug from '@gerhobbelt/slug';
import yaml from 'js-yaml';
import MarkDown from '@gerhobbelt/markdown-it';
import mdPluginCollective from 'markdown-it-dirty-dozen';
import { fileURLToPath, URL } from 'url';
import cheerio from 'cheerio';
import glob from '@gerhobbelt/glob';
import gitignoreParser from '@gerhobbelt/gitignore-parser';
import assert from 'assert';
import path from 'path';
import fs from 'fs';

//

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.normalize(path.join(__dirname, '../package.json')), 'utf8'));
let DEBUG = 1;
const markdownTokens = {};
const config = {
  docTreeBasedir: null,
  destinationPath: null,
  outputDirRelativePath: null
};
const globDefaultOptions = {
  debug: DEBUG > 4,
  matchBase: true,
  silent: false,
  strict: true,
  realpath: true,
  realpathCache: {},
  follow: false,
  dot: false,
  mark: true,
  nodir: true,
  sync: false,
  nounique: false,
  nonull: false,
  nosort: true,
  nocase: true,
  stat: false,
  noprocess: false,
  absolute: false,
  maxLength: Infinity,
  cache: {},
  statCache: {},
  symlinks: {},
  cwd: null,
  root: null,
  nomount: false
};
function main() {
  nomnom.script('deGaulle');
  nomnom.command('build').option('debug', {
    abbr: 'd',
    flag: false,
    'default': 0,
    help: 'Print debugging info'
  }).option('config', {
    abbr: 'c',
    'default': 'config.js',
    help: 'JS script file with custom handlers'
  }).option('output', {
    abbr: 'o',
    flag: false,
    help: 'directory to write results to'
  }).callback(function (opts, cmd) {
    try {
      buildWebsite(opts, cmd);
    } catch (ex) {
      console.error(`ERROR: ${ex.message}\n\nException:\n${ex}`);
      process.exit(5);
    }
  }).help('build website from sources');
  nomnom.command('sanity').option('debug', {
    abbr: 'd',
    flag: false,
    help: 'Print debugging info'
  }).option('config', {
    abbr: 'c',
    'default': 'config.js',
    help: 'JS script file with custom handlers'
  }).option('outfile', {
    abbr: 'o',
    help: 'file to write results to'
  }).callback(function (opts, cmd) {
    try {
      sanityCheck(opts, cmd);
    } catch (ex) {
      console.error(`ERROR: ${ex.message}\n\nException:\n${ex}`);
      process.exit(5);
    }
  }).help('run the sanity tests');
  nomnom.nocommand().option('debug', {
    abbr: 'd',
    flag: false,
    'default': 0,
    help: 'Print debugging info'
  }).option('config', {
    abbr: 'c',
    'default': 'config.js',
    help: 'JS script file with custom drivers'
  }).option('version', {
    flag: true,
    help: 'print version and exit',
    callback: function () {
      return `version ${pkg.version}`;
    }
  }).callback(function (opts, cmd) {
    try {
      buildWebsite(opts, cmd);
    } catch (ex) {
      console.error(`ERROR: ${ex.message}\n\nException:\n${ex}`);
      process.exit(5);
    }
  });
  nomnom.parse();
} // -- done --

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

function limitDebugOutput4Collection(allFiles) {
  if (allFiles) {
    const rv = {};

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

function slugify4Path(filePath) {
  // slugify each path element individually so the '/' path separators don't get munched in the process!
  let elems = unixify(filePath).split('/');
  elems = elems.map(el => {
    return slug(el, {
      mode: 'filename',
      replacement: '_'
    });
  });
  return elems.join('/');
}

function slugify4TitleId(title) {
  return slug(title, {
    mode: 'pretty' // or should we use uslug?

  });
}
//
// underscores or dashes *around* a word are kept as-is:
//    _laugh_ or -perish- 


function sanitizePathTotitle(str) {
  return str.replace(/(?:^|\b)-(?:\b|$)/g, ' ').replace(/(?:^|\B)_(?:\B|$)/g, ' ').trim();
} // CYRB53 hash (NOT a secure hash)

function readOptionalTxtConfigFile(rel) {
  const p = absSrcPath(rel);

  if (fs.existsSync(p)) {
    const src = fs.readFileSync(p, 'utf8'); // - split into lines
    // - filter out any lines which don't have an '='
    // - split each line across the initial '=' in there.
    // - turn this into a hash table?

    const lines = src.split(/[\r\n]/g);
    const linesarr = lines.filter(l => l.trim().length > 1 && l.includes('=')).map(l => {
      let parts = l.split('=');

      if (parts.length !== 2) {
        throw new Error(`config line in ${rel} is expected to have only one '='`);
      }

      parts = parts.map(l => l.trim());
      return parts;
    });
    const rv = {};
    linesarr.forEach(l => {
      rv[l[0]] = l[1];
    });
    return rv;
  }

  return {};
} // name to path for wiki links


function myCustomPageNamePostprocessor(spec) {
  // clean up unwanted characters
  spec = spec.replace(/ :: /g, '/');
  spec = spec.replace(/ --* /g, '/');
  spec = slugify4Path(spec);
  return spec;
} // this assumes `relativeDirPath` is normalized and does not contain ../ path segments anywhere.
//
// Returns a ./ or ../.../ path with trailing /


function calculateRelativeJumpToBasePath(relativeDirPath) {
  if (relativeDirPath === '.' || relativeDirPath == null) {
    relativeDirPath = '';
  }

  relativeDirPath = relativeDirPath.replace(/\/$/, ''); // remove possible trailing /
  // count number of directories and generate a ../../../... path accordingly:

  const destDepthArr = relativeDirPath.split('/');
  const jumpbackPath = new Array(destDepthArr.length + 1).join('../');
  return relativeDirPath === '' ? './' : jumpbackPath;
} // ripped from linkinator and then tweaked: which HTML tag has URLs in which attributes?


const linksAttr = {
  background: ['body'],
  cite: ['blockquote', 'del', 'ins', 'q'],
  data: ['object'],
  href: ['a', 'area', 'embed', 'link'],
  icon: ['command'],
  longdesc: ['frame', 'iframe'],
  manifest: ['html'],
  content: ['meta'],
  poster: ['video'],
  pluginspage: ['embed'],
  pluginurl: ['embed'],
  src: ['audio', 'embed', 'frame', 'iframe', 'img', 'input', 'script', 'source', 'track', 'video'],
  srcset: ['img', 'source']
};

function getLinks(document, baseFilePath) {
  const $ = document;
  let realBaseUrl;
  const base = $('base[href]');

  if (base.length) {
    // only first <base> by specification
    const htmlBaseUrl = base.first().attr('href');
    console.log('processing page with <base> tag.', {
      htmlBaseUrl
    });
    realBaseUrl = getBaseUrl(htmlBaseUrl, baseFilePath);
    if (DEBUG >= 1) console.log('getBaseUrl:', {
      htmlBaseUrl,
      baseFilePath,
      realBaseUrl
    });
  } else {
    realBaseUrl = getBaseUrl('.', baseFilePath);
    if (DEBUG >= 2) console.log('getBaseUrl:', {
      dir: '.',
      baseFilePath,
      realBaseUrl
    });
  }

  const links = new Array();
  const attrs = Object.keys(linksAttr);

  for (const attr of attrs) {
    const elements = linksAttr[attr].map(tag => `${tag}[${attr}]`).join(',');
    $(elements).each((i, ele) => {
      const element = ele;

      if (!element.attribs) {
        return;
      }

      const values = parseAttr(attr, element.attribs[attr]); // ignore href properties for link tags where rel is likely to fail

      const relValuesToIgnore = ['dns-prefetch', 'preconnect'];

      if (element.tagName === 'link' && relValuesToIgnore.includes(element.attribs.rel)) {
        return;
      } // Only for <meta content=""> tags, only validate the url if
      // the content actually looks like a url


      if (element.tagName === 'meta' && element.attribs.content) {
        try {
          new URL(element.attribs.content);
        } catch (e) {
          return;
        }
      }

      for (const v of values) {
        if (v) {
          const link = parseLink(v, realBaseUrl, element, attr);

          if (!v.startsWith('https://')) {
            if (DEBUG >= 2) console.log('parseLink:', {
              v,
              realBaseUrl,
              result: link.url
            });
          }

          links.push(link);
        }
      }
    });
  }

  return links;
}

function getBaseUrl(htmlBaseUrl, oldBaseUrl) {
  if (isAbsoluteUrl(htmlBaseUrl)) {
    return htmlBaseUrl;
  }

  try {
    const url = new URL(htmlBaseUrl, oldBaseUrl);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch (ex) {
    // merge paths:
    if (!path.isAbsolute(htmlBaseUrl)) {
      htmlBaseUrl = path.join(oldBaseUrl, htmlBaseUrl);

      if (!path.isAbsolute(htmlBaseUrl)) {
        htmlBaseUrl = path.join('/', htmlBaseUrl);
      }
    } // URL class constructor automatically does URL path normalization:
    //
    // http://x.ccom/a/b/c/../d.html --> path: /a/b/d.html


    const url = new URL('http://localhost' + unixify(htmlBaseUrl));
    url.search = '';
    url.hash = '';
    return url.href;
  }
}

function isAbsoluteUrl(url) {
  // Don't match Windows paths
  if (/^[a-zA-Z]:\\/.test(url)) {
    return false;
  } // Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
  // Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3


  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
}

function parseAttr(name, value) {
  switch (name) {
    case 'srcset':
      return value.split(',').map(pair => pair.trim().split(/\s+/)[0]);

    default:
      return [value];
  }
}

function parseLink(link, baseUrl, node, attr) {
  // strip off any 'file://' prefix first:
  if (link.startsWith('file://')) {
    link = link.slice(7);
  } // remove Windows drive letters from 'absolute' paths:


  link = link.replace(/^\/?[a-zA-Z][:]\//, '');

  try {
    const url = new URL(link, baseUrl); //url.hash = '';

    return {
      node,
      attr,
      link,
      url,
      href: url.href
    };
  } catch (error) {
    console.log('parseLink error', {
      error,
      link,
      baseUrl,
      attr
    });
    return {
      node,
      attr,
      link,
      error,
      href: null
    };
  }
}

async function loadConfigScript(configScript) {
  if (configScript) {
    // https://stackoverflow.com/questions/42453683/how-to-reject-in-async-await-syntax
    if (DEBUG >= 1) console.log(`loadConfigScript(${configScript})`);

    if (!path.isAbsolute(configScript)) {
      // make sure `import` sees a './'-based relative path, or it barf a hairball as it will treat the base directory as a package identifier instead!
      configScript = unixify(path.join(process.cwd(), configScript));
    }

    if (DEBUG >= 1) console.log(`loadConfigScript(prepped: '${configScript}')`);

    try {
      const processors = await import('file://' + configScript);
      return processors;
    } catch (err) {
      console.error('######## ERROR: ', err); //throw new AggregateError([ err ], `Cannot open/load config script file '${configScript}'`);

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
  console.log(`sanityCheck: command: ${command || '<no-command>'}, opts: ${JSON.stringify(opts, null, 2)}`);
  DEBUG = Math.max(DEBUG, Number.isFinite(+opts.debug) ? +opts.debug : opts.debug ? 1 : 0);
  console.log('DEBUG = ', DEBUG);
  return new Promise((resolve, reject) => {
    resolve(0);
  });
}

async function globDirectory(pathWithWildCards, globConfig) {
  assert(pathWithWildCards != null);
  if (DEBUG >= 8) console.log('scanPath:', pathWithWildCards);
  return new Promise((resolve, reject) => {
    glob(pathWithWildCards, globConfig, function processGlobResults(err, files) {
      if (err) {
        reject(new Error(`glob scan error: ${err}`));
        return;
      }

      if (DEBUG >= 1) console.log(` --> scan: ${JSON.stringify(files, null, 2)}`);
      resolve(files);
    });
  });
}

async function buildWebsite(opts, command) {
  console.log(`buildWebsite: command: ${command || '<no-command>'}, opts: ${JSON.stringify(opts, null, 2)}`);
  DEBUG = Math.max(DEBUG, Number.isFinite(+opts.debug) ? +opts.debug : opts.debug ? 1 : 0);
  console.log('DEBUG = ', DEBUG);

  const paths = opts._.slice(command ? 1 : 0);

  const minPathsCount = 1;

  if (!paths || paths.length < minPathsCount) {
    throw new Error('Must specify at least one file path as starting point. None were specified.');
  } // load the config script, iff it exists:


  const configScript = opts.config;
  let processors = null;

  try {
    processors = await loadConfigScript(configScript);
  } catch (err) {
    console.error('##### ERROR while importing config script. (Will continue with a default script.)\nError: ', err);
    processors = await loadConfigScript(null);
  }

  assert(processors.default != null);
  assert(typeof processors.default === 'function', `configScript "${configScript}" is supposed to define at least a 'default' processor function`);
  if (DEBUG >= 1) console.log('configScript.processors = ', processors);
  let firstEntryPointPath = paths[0]; // make sure we start with an absolute path; everything will derive off this one.

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
    let basePath = firstEntryPointPath;
    basePath = unixify(basePath);
    let scanPath = path.join(firstEntryPointPath, '{index,readme}.{md,htm,html}');
    scanPath = unixify(scanPath);
    if (DEBUG >= 8) console.log('scanPath:', scanPath);
    const globConfig = Object.assign({}, globDefaultOptions, {
      nodir: true,
      cwd: basePath
    });
    assert(scanPath != null);
    const files = await globDirectory(scanPath, globConfig);
    if (DEBUG >= 3) console.log(`root point DIR --> scan: ${JSON.stringify(files, null, 2)}`);
    const filelist = files || [];

    for (const f of filelist) {
      if (DEBUG >= 10) console.log('Loop!', {
        f
      });
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
      throw new Error(`Could not find a default entry point file (index.md, index.html or README.md) in the entry point directory ${firstEntryPointPath} (${scanPath})`);
    }
  }

  if (!entryStats) {
    throw new Error(`entry point does not exist: ${firstEntryPointPath}`);
  }

  if (!entryStats.isFile()) {
    throw new Error(`entry point is not a file: ${firstEntryPointPath}`);
  }

  config.docTreeBasedir = path.dirname(firstEntryPointPath);
  if (DEBUG >= 1) console.log('docTreeBasedir = ', config.docTreeBasedir);
  let outputDirPath = paths[1] || path.join(config.docTreeBasedir, !config.docTreeBasedir.endsWith('docs') ? '../docs' : '../' + path.basename(config.docTreeBasedir) + '-output'); // make sure we start with an absolute path; everything will derived off this one.

  if (!path.isAbsolute(outputDirPath)) {
    outputDirPath = path.join(process.cwd(), outputDirPath);
  }

  outputDirPath = unixify(path.normalize(outputDirPath));
  if (DEBUG >= 1) console.log('outputDirPath = ', outputDirPath);
  config.destinationPath = outputDirPath;
  config.outputDirRelativePath = unixify(path.relative(config.docTreeBasedir, config.destinationPath));
  if (DEBUG >= 2) console.log('config:', config);
  const rv_mapping_def = {
    markdown: ['md', 'markdown'],
    html: ['html', 'htm'],
    js: ['js', 'mjs', 'ejs', 'cjs', 'ts', 'coffee'],
    css: ['css', 'scss', 'less', 'styl', 'stylus'],
    image: ['png', 'gif', 'jpg', 'jpeg', 'tiff', 'bmp', 'svg', 'psd', 'ai', 'webp'],
    font: ['ttf', 'otf', 'eot', 'woff2'],
    movie: ['mkv', 'mp4', 'avi', 'mov', 'flv', 'webm'],
    archive: ['zip', 'rar', 'gz', 'bz2', '7z'],
    distro: ['exe', 'msi']
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
    if (DEBUG >= 4) console.log('key n', {
      n,
      a
    });

    for (const b of a) {
      if (DEBUG >= 4) console.log('map n -> b', {
        n,
        b
      });
      rv_mapping.set('.' + b, n);
    }
  }

  if (DEBUG >= 3) console.log('######################### mapping ##########################\n', rv_mapping, '\n###########################################'); // now find all gitignore files, load them and use them to find out which DIRECTORIES 
  // we'll have to ignore at the very least: this should speed up the later global glob
  // action quite a lot, as we can them specify a solid list of directories to ignore
  // as part of its search options.
  //
  // Produces an object carrying an array of directories to ignore, plus an array listing
  // all gitignore files, plus a hash table which carries the parsed gitignore files
  // for further use.
  //
  // Each directory/file record has this format:
  //
  // {
  //   path,        -- full path to file
  //   name         -- filename
  //   relativePath --  relative path to config.docTreeBasedir
  // }
  //

  function mkIgnoreFileRecord(filePath) {
    const f = unixify(path.resolve(filePath));
    const fname = path.basename(f);
    const el = {
      path: f,
      name: fname,
      relativePath: unixify(path.relative(config.docTreeBasedir, f))
    };
    return el;
  }

  async function collectAllIgnoreFilesInDirectory(baseDirPath) {
    let basePath = unixify(path.resolve(baseDirPath));
    let scanPath = path.join(basePath, '.*ignore');
    scanPath = unixify(scanPath);
    if (DEBUG >= 8) console.log('scanPath:', scanPath);
    const globConfig = Object.assign({}, globDefaultOptions, {
      dot: true,
      nodir: true
    }); // Gather all ignore files, collect their content (they are all
    // assumed to have the same gitignore format anyway) and feed that
    // to the gitignore compiler:

    const files = await globDirectory(scanPath, globConfig);
    let rv = {
      filesToProcess: [],
      directoriesProcessed: [],
      directoriesToIgnore: [],
      ignoreFilePaths: [],
      ignoreInfo: null
    };
    let ignoreContent = [];

    for (const p of files || []) {
      const el = mkIgnoreFileRecord(p);
      ignoreContent.push(fs.readFileSync(el.path, 'utf8'));
      rv.ignoreFilePaths.push(el);
    } // Now that we have collected all ignore files' content, we can
    // check if there's anything useful in there and compile that
    // for further use later on. 


    let str = ignoreContent.join('\n\n\n').trim();

    if (str.length > 0) {
      // at least there's something to parse today...
      let gitignoreData = gitignoreParser.compile(str);
      let rec = {
        directoryPath: basePath,
        compiledIgnoreData: gitignoreData,
        parentRecord: null // we don't know yet if this directory has a parent with gitignore data...

      };
      rv.ignoreInfo = rec;
    }

    return rv;
  }

  function isPathAcceptedByIgnoreRecords(path, ignoreRecord) {
    if (!ignoreRecord || !ignoreRecord.compiledIgnoreData) return true; // gitignore rules: when a child gitignore file has something to say 
    // about a path, then we do not bother the parent. (Override By Child)

    if (ignoreRecord.compiledIgnoreData.inspects(path)) {
      return ignoreRecord.compiledIgnoreData.accepts(path);
    }

    if (ignoreRecord.parentRecord) {
      return isPathAcceptedByIgnoreRecords(path, ignoreRecord.parentRecord);
    } // accept by default


    return true;
  }

  async function collectAllExceptIgnoredInDirectory(baseDirPath, parentIgnores) {
    assert(baseDirPath != null);
    let basePath = path.resolve(baseDirPath);
    let scanPath = path.join(basePath, '*');
    scanPath = unixify(scanPath);
    if (DEBUG >= 8) console.log('scanPath:', scanPath);
    const globConfig = Object.assign({}, globDefaultOptions, {
      nodir: false,
      mark: true
    });
    assert(scanPath != null);
    const files = await globDirectory(scanPath, globConfig); // collect all the local ignore files.

    let dirscanInfo = await collectAllIgnoreFilesInDirectory(basePath);
    let activeIgnoreRecord = dirscanInfo.ignoreInfo; // hook up the parent if there's any

    if (activeIgnoreRecord && parentIgnores) {
      activeIgnoreRecord.parentRecord = parentIgnores;
    } // otherwise, when we have no ignore record of our own, use the parent as-is
    else if (!activeIgnoreRecord) {
        activeIgnoreRecord = parentIgnores;
      }

    let directoriesToScan = [];

    for (const p of files || []) {
      // skip the entries which are NOT directories? 
      // Nah, keep them around for the ignore check that comes next:
      const isDir = p.endsWith('/');
      let d = mkIgnoreFileRecord(p);
      let ok = isPathAcceptedByIgnoreRecords(d.path, activeIgnoreRecord); // NOTE: the ignore files are themselves *ignored by default*:
      // dot-files are all ignored always.

      if (DEBUG >= 8) console.log(`isPathAcceptedByIgnoreRecords("${d.path}") --> pass: ${ok}, isDir: ${isDir}`); // when the eentry is to be ignored, we add it to the list:

      if (!ok) {
        dirscanInfo.directoriesToIgnore.push(d);
      } else if (isDir) {
        directoriesToScan.push(d.path);
      } else {
        dirscanInfo.filesToProcess.push(d);
      }
    }

    dirscanInfo.directoriesProcessed.push(basePath); // now go and investigate the okay-ed subdirectories:

    for (const p of directoriesToScan) {
      let rv = await collectAllExceptIgnoredInDirectory(p, activeIgnoreRecord);
      dirscanInfo.filesToProcess = dirscanInfo.filesToProcess.concat(rv.filesToProcess);
      dirscanInfo.directoriesToIgnore = dirscanInfo.directoriesToIgnore.concat(rv.directoriesToIgnore);
      dirscanInfo.directoriesProcessed = dirscanInfo.directoriesProcessed.concat(rv.directoriesProcessed);
      dirscanInfo.ignoreFilePaths = dirscanInfo.ignoreFilePaths.concat(rv.ignoreFilePaths);
    }

    return dirscanInfo;
  } // now scan the entire tree: collect potential files for comparison & treatment
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


  async function collectAllFiles() {
    let basePath = config.docTreeBasedir;
    basePath = unixify(basePath);
    let files = await collectAllExceptIgnoredInDirectory(basePath, null);
    if (DEBUG >= 2) console.log(`root point DIR --> scan: ${JSON.stringify(files, null, 2)}`);
    const rv = {
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

    for (const rec of files.filesToProcess || []) {
      AddFileToCollection(rec, rv);
    }

    return rv;
  }

  function AddFileToCollection(fileInfo, collection) {
    // check if the file is to be 'ignored' and treated as a static binary asset:
    let special = false;
    let fpath = fileInfo.path;
    let fname = fileInfo.name;

    if (!fname) {
      console.error("AddFileToCollection:", fileInfo);
    }

    ['CNAME', '.nojekyll'].forEach(f => {
      if (typeof f === 'string' && fname.endsWith(f)) {
        special = true;
      } else if (f instanceof RegExp && f.test(fname)) {
        special = true;
      }
    });
    let ext = path.extname(fname).toLowerCase();

    if (special) {
      ext = '';
    }

    const el = {
      path: fpath,
      name: fname,
      nameLC: fname.toLowerCase(),
      ext: ext,
      relativePath: unixify(path.relative(config.docTreeBasedir, fpath)),
      destinationRelPath: null,
      relativeJumpToBasePath: null,
      RawContent: null,
      contentIsBinary: rv_mapping_bin_content[ext] || special,
      includedInTOC: 0,
      mappingKey: null
    };
    const cat = rv_mapping.get(ext) || 'misc';
    collection[cat].set(fpath, el);

    collection._.set(fpath, el);
  } // async invocation, but don't wait for it yet:


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
    highlight: function () {
      console.error('highligh callback invoked!');
      return '';
    } // Configure default attributes for given tags
    //default_attributes: { a: [['rel', 'nofollow']] }

  }); // augment the md instance for use with the markdown_it_include plugin:
  //md.getIncludeRootDir = ...

  if (DEBUG >= 2) console.log('setting up markdown-it:', mdPluginCollective, typeof mdPluginCollective.use_dirty_dozen);
  mdPluginCollective.use_dirty_dozen(md, {
    abbr: {
      abbreviations: readOptionalTxtConfigFile('.deGaulle/abbr-abbreviations.txt'),
      links: readOptionalTxtConfigFile('.deGaulle/abbr-links.txt'),
      emphasis: readOptionalTxtConfigFile('.deGaulle/abbr-emphasis-phrases.txt')
    },
    attrs: true,
    anchor: {
      permalink: true,
      permalinkBefore: true,
      permalinkSymbol: `
        <svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true">
          <path fill-rule="evenodd" d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"></path>
        </svg>`,
      slugify: function (el_title) {
        return slugify4TitleId(el_title);
      }
    },
    //githubHeadings: false,
    footnote: {
      atDocumentEnd: false
    },
    furigana: true,
    frontMatter: {
      callback: function (meta, token, state) {
        try {
          const doc = yaml.load(meta);
          token.meta = doc; // override token.meta with the parsed object

          console.log('parsed YAML:', doc);
        } catch (ex) {
          console.error('error parsing frontmatter YAML:', ex);
          throw ex;
        }
      }
    },
    include: {
      root: '/includes/',
      getRootDir: (options, state, startLine, endLine) => {
        if (DEBUG >= 2) console.log('includes:: state:', {
          state
        });
        return state.env.getIncludeRootDir(options, state, startLine, endLine);
      }
    },
    title: {
      level: 0 // grab the first H1/H2/... that we encounter

    },
    wikilinks: {
      postProcessPageName: function (pageName) {
        const rv = myCustomPageNamePostprocessor(pageName);
        if (DEBUG >= 2) console.log('wikilink transform:', {
          'in': pageName,
          out: rv
        });
        return rv;
      }
    },
    // [[toc]]
    tableOfContents: false,
    // @[toc](Title)
    toc: true,
    // @[toc]               -- no title...
    tocAndAnchor: false,
    // ${toc} | [[toc]]     -- but we removed that last version by specifying a custom placeholder here:
    tocDoneRight: {
      placeholder: '(\\$\\{toc\\})',
      slugify: function (el_title) {
        return slugify4TitleId(el_title);
      }
    }
  });
  const allFiles = await scan;
  if (DEBUG >= 2) console.log('!!!!!!!!!!!!!!!! allFiles:', limitDebugOutput4Collection(allFiles));

  if (!allFiles.markdown.get(firstEntryPointPath) && !allFiles.html.get(firstEntryPointPath)) {
    throw new Error(`root file '${firstEntryPointPath}' is supposed to be part of the website`);
  }

  console.log('processing/loading site files...'); // now process the HTML, MD, CSS, JS and other 'fixed assets' files:
  //
  // [css, js, image, movie, misc, _]

  for (const type in allFiles) {
    switch (type) {
      case '_':
        continue;

      case 'markdown':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
            const key = slot[0];
            const entry = slot[1]; // as these pages will be rendered to HTML, they'll receive the html extension:

            entry.destinationRelPath = slugify4Path(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
            entry.relativeJumpToBasePath = calculateRelativeJumpToBasePath(path.dirname(entry.destinationRelPath));
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
            const entry = slot[1]; // It doesn't matter whether these started out as .htm or .html files: we output them as .html files anyway:

            entry.destinationRelPath = slugify4Path(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + '.html';
            entry.relativeJumpToBasePath = calculateRelativeJumpToBasePath(path.dirname(entry.destinationRelPath));
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
            entry.destinationRelPath = slugify4Path(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
            entry.relativeJumpToBasePath = calculateRelativeJumpToBasePath(path.dirname(entry.destinationRelPath));
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
            entry.destinationRelPath = slugify4Path(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + entry.ext;
            entry.relativeJumpToBasePath = calculateRelativeJumpToBasePath(path.dirname(entry.destinationRelPath));
            if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, showRec(entry));
            const specRec2 = await loadFixedAssetBinaryFile(key, allFiles, collection);
            if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
            assert.strictEqual(specRec2, entry);
          }
        }
        continue;
    }
  } // now's the time to match the links in the generated content and do some linkage reporting alongside:
  //


  if (DEBUG >= 2) console.log('>>>>>>>>>>>>>>>>>>>> allFiles:', limitDebugOutput4Collection(allFiles));
  if (DEBUG >= 1) console.log('markdown AST token types:', Object.keys(markdownTokens).sort());
  console.log('tracing site files...'); // now trace the access graph:
  //
  // [css, js, image, movie, misc, _]

  for (const type in allFiles) {
    switch (type) {
      case '_':
        continue;

      case 'markdown':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
          }
        }
        continue;

      case 'html':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
            //entry.destinationRelPath
          }
        }
        continue;

      case 'css':
      case 'js':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
          }
        }
        continue;

      default:
        {
          const collection = allFiles[type];

          for (const slot of collection) {
          }
        }
        continue;
    }
  }

  console.log('updating/patching site files...'); // now patch links, etc. in the HTML, MarkDown, CSS and JS files:
  //
  // [css, js, image, movie, misc, _]

  for (const type in allFiles) {
    switch (type) {
      case '_':
        continue;

      case 'markdown':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
          }
        }
        continue;

      case 'html':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
            const key = slot[0];
            const entry = slot[1];

            if (key.includes('getsatisfaction-mirror/')) {
              filterHtmlOfGetsatisfactionPages(entry);
            }
          }
        }
        continue;

      case 'css':
      case 'js':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
          }
        }
        continue;

      default:
        {
          const collection = allFiles[type];

          for (const slot of collection) {
          }
        }
        continue;
    }
  }

  console.log('rendering site files\' content...'); // render the HTML, MarkDown, CSS and JS files' content:
  //
  // [css, js, image, movie, misc, _]

  for (const type in allFiles) {
    switch (type) {
      case '_':
        continue;

      case 'markdown':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
            const key = slot[0];
            const entry = slot[1];
            const specRec2 = await renderMD(key, md, allFiles);
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
            const specRec2 = await renderHTML(key, allFiles);
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
            const specRec2 = await renderFixedAssetTextFile(key, allFiles, collection);
            if (DEBUG >= 3) console.log('specRec:', showRec(specRec2));
            assert.strictEqual(specRec2, entry);
          }
        }
        continue;

      default:
        // we do not 'render' the binary files, right?
        continue;
    }
  } //
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
  // now render the template and postprocess all links:


  console.log('Rendering page templates and extracting all internal links for mapping analysis...');

  for (const type in allFiles) {
    switch (type) {
      case '_':
      default:
        continue;

      case 'html':
      case 'markdown':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
            var _entry$metaData, _entry$metaData$front, _entry$metaData2, _entry$metaData3, _entry$metaData4, _entry$metaData4$fron;
            const entry = slot[1];
            const destFilePath = unixify(path.join(opts.output, entry.destinationRelPath));
            if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record: copy '${entry.path}' --> '${destFilePath}'`);
            filterHtmlHeadAfterMetadataExtraction(entry); // re title: frontMatter should have precedence over any other title source, including the title extracted from the document via H1

            const pathTitle = sanitizePathTotitle(path.basename(entry.relativePath, entry.ext));
            let title = (((_entry$metaData = entry.metaData) == null ? void 0 : (_entry$metaData$front = _entry$metaData.frontMatter) == null ? void 0 : _entry$metaData$front.title) || ((_entry$metaData2 = entry.metaData) == null ? void 0 : _entry$metaData2.docTitle) || pathTitle).trim();
            if (DEBUG >= 1) console.log('TITLE extraction:', {
              sourcePath: entry.relativePath,
              meta: entry.metaData,
              docTitle: (_entry$metaData3 = entry.metaData) == null ? void 0 : _entry$metaData3.docTitle,
              fmTitle: (_entry$metaData4 = entry.metaData) == null ? void 0 : (_entry$metaData4$fron = _entry$metaData4.frontMatter) == null ? void 0 : _entry$metaData4$fron.title,
              pathTitle,
              title
            });

            if (title) {
              title = `<title>${title}</title>`;
            } else {
              title = '';
            }

            const htmlHead = entry.HtmlHead;
            const htmlBody = entry.HtmlBody;
            const originalPath = entry.relativePath;
            let fm = null;

            if (entry.metaData) {
              fm = `<pre>${JSON.stringify(entry.metaData, null, 2)}</pre>`;
            }

            const content = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${title}
    <link href="https://fonts.googleapis.com/css?family=Inconsolata:400,700|Poppins:400,400i,500,700,700i&amp;subset=latin-ext" rel="stylesheet">
    <link rel="stylesheet" href="${entry.relativeJumpToBasePath}css/mini-default.css">
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    ${htmlHead.html()}
  </head>
  <body>
    ${fm || ''}

    ${htmlBody.html()}

    <footer>
      © 2020 Qiqqa Contributors ::
      <a href="https://github.com/GerHobbelt/qiqqa-open-source/blob/master/docs-src/${originalPath}">Edit this page on GitHub</a>
    </footer>
  </body>
</html>
`.trimLeft(); // parse rendered result page and store it for further post-processing:

            const $doc = cheerio.load(content);
            const bodyEl = $doc('body'); // implicitly created

            const headEl = $doc('head'); // update the file record:

            entry.HtmlDocument = $doc;
            entry.HtmlBody = bodyEl;
            entry.HtmlHead = headEl;
            const linkCollection = getLinks($doc, entry.destinationRelPath);
            if (DEBUG >= 2) console.log('collected links for postprocessing:', {
              originalPath,
              linkCollection
            });
            if (DEBUG >= 3) console.log('update the file record after rendering the template:', {
              originalPath,
              entry: showRec(entry)
            });
          }
        }
        continue;

      case 'css':
      case 'js':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
          }
        }
        continue;
    }
  } // output the files into the destination directory


  console.log(`buildWebsite: command: ${command || '<no-command>'}, opts: ${JSON.stringify(opts, null, 2)}`); // first we write the 'default' CNAME and .nojekyll files here. 
  // IFF the user has also provideed these, they will overwrite these ones 
  // in the subsequent copy/write action.

  if (DEBUG >= 1) console.log(`Copying the extra files to the website destination directory '${config.destinationPath}'...`);
  await mdGenerated(); // now write the CSS, HTML, JS and other files:

  console.log(`Writing all processed & collected files to the website destination directory '${config.destinationPath}'...`);

  for (const type in allFiles) {
    switch (type) {
      case '_':
        continue;

      case 'html':
      case 'markdown':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
            const entry = slot[1];
            const destFilePath = unixify(path.join(opts.output, entry.destinationRelPath));
            if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record: copy '${entry.path}' --> '${destFilePath}'`);
            const dstDir = unixify(path.dirname(destFilePath));
            fs.mkdirSync(dstDir, {
              recursive: true
            });
            const content = '<!DOCTYPE html>\n' + entry.HtmlDocument.html();
            fs.writeFileSync(destFilePath, content, 'utf8');
          }
        }
        continue;

      case 'css':
      case 'js':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
            const entry = slot[1];
            const destFilePath = unixify(path.join(opts.output, entry.destinationRelPath));
            if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record: copy '${entry.path}' --> '${destFilePath}'`);
            const dstDir = unixify(path.dirname(destFilePath));
            fs.mkdirSync(dstDir, {
              recursive: true
            });
            fs.writeFileSync(destFilePath, entry.RawContent, 'utf8');
          }
        }
        continue;

      default:
        {
          const collection = allFiles[type];

          for (const slot of collection) {
            const entry = slot[1];
            const destFilePath = unixify(path.join(opts.output, entry.destinationRelPath));
            if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record: copy '${entry.path}' --> '${destFilePath}'`);
            const dstDir = unixify(path.dirname(destFilePath));
            fs.mkdirSync(dstDir, {
              recursive: true
            });
            fs.copyFileSync(entry.path, destFilePath, fs.constants.COPYFILE_FICLONE);
          }
        }
        continue;
    }
  }
} // compile the MarkDown files to a token stream. Belay *rendering* until all files, including the HTML files out there,
// have been processed as we will be patching some tokens in there before the end is neigh!


async function compileMD(mdPath, md, allFiles) {
  if (DEBUG >= 3) console.log(`processing file: ${mdPath}...`);
  return new Promise((resolve, reject) => {
    fs.readFile(mdPath, {
      encoding: 'utf8'
    }, async (err, data) => {
      if (err) {
        reject(new Error(`ERROR: read error ${err} for file ${mdPath}`));
        return;
      }

      const env = {
        getIncludeRootDir: null,
        title: null
      };
      if (DEBUG >= 8) console.log(`source: length: ${data.length}`); // augment the md instance for use with the markdown_it_include plugin:

      env.getIncludeRootDir = function (options, state, startLine, endLine) {
        if (DEBUG >= 6) console.log('##### include root dir is today:', {
          dir: path.dirname(mdPath)
        });
        return path.dirname(mdPath);
      }; // let content = md.render(data); --> .parse + .renderer.render
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

      if (env.title) {
        metadata.docTitle = env.title.trim();
      } // update the file record:


      const el = allFiles.markdown.get(mdPath);
      if (DEBUG >= 3) console.log('update the file record:', {
        mdPath,
        el: showRec(el)
      });
      el.mdState = state;
      el.mdEnv = env;
      el.mdTypeMap = typeMap;
      el.metaData = metadata;
      resolve(el);
    });
  });
} // compile the MarkDown files to a token stream. Belay *rendering* until all files, including the HTML files out there,
// have been processed as we will be patching some tokens in there before the end is neigh!


async function renderMD(mdPath, md, allFiles) {
  if (DEBUG >= 3) console.log(`processing file: ${mdPath}...`);
  return new Promise((resolve, reject) => {
    const el = allFiles.markdown.get(mdPath);
    const state = el.mdState;
    const env = el.mdEnv;
    const metadata = el.metaData;
    const tokens = state.tokens;
    const content = md.renderer.render(tokens, md.options, env);
    if (DEBUG >= 4) console.log('output:\n', limitDebugOutput(content));
    const $doc = cheerio.load('<html><head><body>\n' + content);
    const bodyEl = $doc('body'); // implicitly created

    const headEl = $doc('head');
    if (DEBUG >= 5) console.log('MARKDOWN:\n', showRec({
      html: $doc,
      body: bodyEl.html(),
      head: headEl.html()
    })); // update the file record:

    if (DEBUG >= 3) console.log('update the file record:', {
      mdPath,
      el: showRec(el)
    });
    el.HtmlDocument = $doc;
    el.HtmlBody = bodyEl;
    el.HtmlHead = headEl;
    el.metaData = metadata;
    resolve(el);
  });
} // compile the HTML files to a DOM token stream. Belay *rendering* until all files, including the MarkDown files out there,
// have been processed as we will be patching some DOM nodes in there before the end is neigh!


async function loadHTML(htmlPath, allFiles) {
  if (DEBUG >= 3) console.log(`processing file: ${htmlPath}...`);
  return new Promise((resolve, reject) => {
    fs.readFile(htmlPath, {
      encoding: 'utf8'
    }, async (err, data) => {
      var _titleEl$html;

      if (err) {
        reject(new Error(`ERROR: read error ${err} for file ${htmlPath}`));
        return;
      }

      if (DEBUG >= 8) console.log(`source: length: ${data.length}`);
      const $doc = cheerio.load(data);
      const bodyEl = $doc('body'); // implicitly created

      const headEl = $doc('head');
      const titleEl = headEl.find('title');
      const title = (_titleEl$html = titleEl.html()) == null ? void 0 : _titleEl$html.trim();
      if (DEBUG >= 3) console.log('HTML:\n', showRec({
        html: $doc,
        body: bodyEl.html(),
        head: headEl.html()
      })); // update the file record:

      const el = allFiles.html.get(htmlPath);
      el.HtmlDocument = $doc;
      el.HtmlBody = bodyEl;
      el.HtmlHead = headEl;

      if (title) {
        el.metaData = {
          docTitle: title
        };
      }

      resolve(el);
    });
  });
} // remove any HTML DOM elements from the <head> section which would otherwise collide with the standard metadata.


function filterHtmlHeadAfterMetadataExtraction(entry) {
  const $doc = entry.HtmlDocument;
  const headEl = $doc('head');
  const titleEl = headEl.find('title');
  titleEl == null ? void 0 : titleEl.remove();
}

function filterHtmlOfGetsatisfactionPages(entry) {
  const $doc = entry.HtmlDocument;
  const headEl = $doc('head');
  if (DEBUG >= 2) console.log('getsatis filtering:', {
    headEl,
    children: headEl.children()
  }); // delete all <script> elements anywhere in there:

  $doc('script').remove(); // kill the <base> tag too

  headEl.find('base').remove(); // kill RSS link, etc.

  const metalist = ['type="application/rss+xml"', 'property="fb:admins"', 'name="csrf-param"', 'name="csrf-token"',
  /*
  <meta content="website" property="og:type">
  <meta content="https://getsatisfaction.com/qiqqa/topics/-helloooo" property="og:url">
  <meta content="https://getsatisfaction.com/assets/question_med.png" property="og:image">
  <meta content="Qiqqa.com" property="og:site_name">
   */
  'property="og:type"', 'property="og:url"', 'property="og:image"', 'property="og:site_name"', // https://api.jquery.com/category/selectors/
  // kill one of the style sheets at least
  'href*="assets/employee_tools"'];
  metalist.forEach(prop => {
    headEl.find(`[${prop}]`).remove();
  });
  headEl.find('link[rel="shortcut icon"]').remove();
  const kill_list = ['#header_search_topic', 'div[style*="left: -10000px;"]', '.crumb_select', // kill all the <style> blobs and CSS loads too:
  'style', 'link[type="text/css"]', '#overlay', '#followable_dropdown', '#mini_profile'];
  kill_list.forEach(prop => {
    $doc(prop).remove();
  });
  const kill_attr_list = ['onclick', 'onmouseover', 'onmouseout'];
  kill_attr_list.forEach(prop => {
    $doc(`[${prop}]`).removeAttr(prop);
  }); // nuke the head comment blocks (old IEE stuff, etc.)

  let node = headEl.children()[0];

  while (node != null) {
    if (node.type === 'comment') {
      // HACK: turn this into an empty 'text' node instead!
      const tn = node; // shut up TypeScript too...

      tn.type = 'text';
      tn.data = '';
    }

    node = node.next;
  } //console.log('getsatis filtering done:', { html: $doc.html(), children: headEl.children(), head: headEl.html() });

} // compile the HTML files to a DOM token stream. Belay *rendering* until all files, including the MarkDown files out there,
// have been processed as we will be patching some DOM nodes in there before the end is neigh!


async function renderHTML(htmlPath, allFiles) {
  if (DEBUG >= 3) console.log(`processing file: ${htmlPath}...`);
  return new Promise((resolve, reject) => {
    const el = allFiles.html.get(htmlPath);
    const $doc = el.HtmlDocument;
    const bodyEl = el.HtmlBody;
    const headEl = el.htmlHead;
    if (DEBUG >= 3) console.log('HTML:\n', showRec({
      html: $doc,
      body: bodyEl.html(),
      head: headEl.html()
    })); // update the file record:

    resolve(el);
  });
}

async function loadFixedAssetTextFile(filePath, allFiles, collection) {
  if (DEBUG >= 3) console.log(`processing file: ${filePath}...`);
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, {
      encoding: 'utf8'
    }, async (err, data) => {
      if (err) {
        reject(new Error(`ERROR: read error ${err} for file ${filePath}`));
        return;
      }

      if (DEBUG >= 8) console.log(`source: length: ${data.length}`); // update the file record:

      const el = collection.get(filePath);
      el.RawContent = data;
      resolve(el);
    });
  });
}

async function renderFixedAssetTextFile(filePath, allFiles, collection) {
  if (DEBUG >= 3) console.log(`processing file: ${filePath}...`);
  return new Promise((resolve, reject) => {
    // update the file record:
    const el = collection.get(filePath); //el.RawContent = data;

    resolve(el);
  });
}

async function loadFixedAssetBinaryFile(filePath, allFiles, collection) {
  if (DEBUG >= 3) console.log(`processing file: ${filePath}...`); // We DO NOT load binary files as that would only clutter the nodeJS heap memory and cause out-of-memory exceptions.

  return new Promise((resolve, reject) => {
    const x = fs.existsSync(filePath);

    if (!x) {
      reject(new Error(`ERROR: file '${filePath}' does not exist.`));
      return;
    } //if (DEBUG >= 8) console.log(`source: length: ${data.length}`);
    // update the file record:


    const el = collection.get(filePath); //el.RawContent = data;

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

async function mdGenerated(pagePaths) {
  // cp docs-src/.nojekyll docs/ && cp docs-src/CNAME docs/
  console.log('async generated HIT');
  fs.writeFileSync(absDstPath('CNAME'), 'qiqqa.org\n', 'utf8');
  fs.writeFileSync(absDstPath('.nojekyll'), '');
}

function traverseTokens(tokens, cb, depth) {
  depth = depth || 0;

  for (let i = 0, len = tokens.length; i < len; i++) {
    const t = tokens[i];
    cb(t, i, tokens, depth);

    if (t.children) {
      traverseTokens(t.children, cb, depth + 1);
    }
  }
} // demo()
//   .then(() => {
//      console.log('done');
//   })
//   .catch(err => {
//     console.error('error:', err);
//   });

export default main;
//# sourceMappingURL=deGaulle.js.map
