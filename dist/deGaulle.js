/*! deGaulle 1.0.0-1 https://github.com//GerHobbelt/deGaulle @license MIT */

'use strict';

//
//
//
const nomnom = require('@gerhobbelt/nomnom');

const MarkDown = require('@gerhobbelt/markdown-it');

const mdPluginCollective = require('markdown-it-dirty-dozen');

const pkg = require('../package.json');

const jsdom = require('jsdom');

const {
  JSDOM
} = jsdom;

const glob = require('@gerhobbelt/glob');

const gitignoreParser = require('@gerhobbelt/gitignore-parser');

const assert = require('assert');

const _ = require('lodash');

const path = require('path');

const fs = require('fs');

let DEBUG = 10;
const markdownTokens = {};
const config = {
  docTreeBasedir: null,
  destinationPath: null,
  outputDirRelativePath: null
};
nomnom.script('deGaulle');
nomnom.command('build').option('debug', {
  abbr: 'd',
  flag: false,
  help: 'Print debugging info'
}).option('config', {
  abbr: 'c',
  'default': 'config.json',
  help: 'JSON file with tests to run'
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
  'default': 'config.json',
  help: 'JSON file with tests to run'
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
  help: 'Print debugging info'
}).option('config', {
  abbr: 'c',
  'default': 'config.json',
  help: 'JSON file with tests to run'
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
nomnom.parse(); // -- done --

function unixify(path) {
  return path.replace(/\\/g, '/');
}

function absSrcPath(rel) {
  const p = path.join(config.docTreeBasedir, rel);
  return unixify(path.resolve(p));
}

function readOptionalTxtConfigFile(rel) {
  const p = absSrcPath(rel);

  if (fs.existsSync(p)) {
    const src = fs.readFileSync(p, 'utf8'); // - split into lines
    // - filter out any lines whicch don't have an '='
    // - split each line across the initial '=' in there.
    // - turn this into a hash table?

    let lines = src.split(/[\r\n]/g);
    lines = lines.filter(l => l.trim().length > 1 && l.includes('=')).map(l => {
      let parts = l.split('=');

      if (parts.length !== 2) {
        throw new Error(`config line in ${rel} is expected to have only one '='`);
      }

      parts = parts.map(l => l.trim());
      return parts;
    });
    const rv = {};
    lines.forEach(l => {
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
  spec = _.deburr(spec).trim(); // normalize case

  spec = spec.toLowerCase();
  spec = spec.replace(/[^\w\d\s\/_-]/g, '_');
  spec = spec.replace(/__+/g, '_');
  spec = spec.replace(/\s+/g, ' ');
  if (DEBUG >= 7) console.log('myCustomPageNamePostprocessor STAGE 1', spec);
  spec = spec.replace(/_-_/g, '_');
  spec = spec.replace(/ - /g, ' ');
  spec = spec.replace(/[ _]* [ _]*/g, ' ');
  if (DEBUG >= 7) console.log('myCustomPageNamePostprocessor STAGE 2', spec);
  spec = spec.replace(/(^|\/)[ _]+/g, '$1');
  spec = spec.replace(/[ _]+($|\/)/g, '$1');
  if (DEBUG >= 7) console.log('myCustomPageNamePostprocessor STAGE 3', spec);
  spec = spec.replace(/ /g, '_');
  if (DEBUG >= 7) console.log('myCustomPageNamePostprocessor STAGE 4', spec);
  return spec;
}

async function sanityCheck(opts, command) {
  console.log(`sanityCheck: command: ${command || '<no-command>'}, opts: ${JSON.stringify(opts, null, 2)}`);
  DEBUG = Math.max(DEBUG, Number.isFinite(+opts.debug) ? +opts.debug : opts.debug ? 1 : 0);
  console.log('DEBUG = ', DEBUG);
  return new Promise((resolve, reject) => {
    resolve(0);
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
  }

  let firstEntryPointPath = paths[0]; // make sure we start with an absolute path; everything will derived off this one.

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
      nocase: true,
      nodir: true,
      nobrace: false,
      gitignore: true
    });
    if (DEBUG >= 1) console.log(`root point DIR --> scan: ${JSON.stringify(files, null, 2)}`);
    const filelist = files || [];

    for (const f of filelist) {
      console.log('Loop!', {
        f
      });
      const basename = path.basename(f.toLowerCase());
      console.log('Can this serve as root?', basename);

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
          console.log('Hit!', basename);

          if (indexFilePriority < 1) {
            indexFilePriority = 1;
            indexFile = f;
          }

          console.log('Continue!', indexFile);
          break;

        default:
          console.log('WUT?!', basename);
          break;
      }
    }

    console.log('Loop end!', indexFile);
    console.log('root scan -> indexFile', indexFile);

    if (indexFile) {
      firstEntryPointPath = unixify(path.resolve(indexFile));
      if (DEBUG >= 1) console.log('root scan -> firstEntryPointPath', firstEntryPointPath);
      entryStats = fs.lstatSync(firstEntryPointPath);
    } else {
      throw new Error(`Could not find a default entry point file (index.md, index.html or README.md) in the entry point directory ${firstEntryPointPath} (${scanPath}`);
    }
  }

  if (!entryStats) {
    throw new Error(`entry point does not exist: ${firstEntryPointPath}`);
  }

  if (!entryStats.isFile()) {
    throw new Error(`entry point is not a file: ${firstEntryPointPath}`);
  }

  config.docTreeBasedir = path.dirname(firstEntryPointPath);
  let outputDirPath = paths[1] || path.join(config.docTreeBasedir, !config.docTreeBasedir.endsWith('docs') ? '../docs' : '../' + path.basename(config.docTreeBasedir) + '-output'); // make sure we start with an absolute path; everything will derived off this one.

  if (!path.isAbsolute(outputDirPath)) {
    outputDirPath = path.join(process.cwd(), outputDirPath);
  }

  outputDirPath = unixify(path.normalize(outputDirPath));
  if (DEBUG >= 1) console.log('outputDirPath = ', outputDirPath);
  config.destinationPath = outputDirPath;
  config.outputDirRelativePath = unixify(path.relative(config.docTreeBasedir, config.destinationPath));
  if (DEBUG >= 1) console.log('config:', config); // now scan the entire tree: collect potential files for comparison & treatment
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
    let scanPath = path.join(config.docTreeBasedir, '**/*');
    scanPath = unixify(scanPath);
    if (DEBUG >= 1) console.log('scanPath:', scanPath);
    return new Promise((resolve, reject) => {
      glob(scanPath, {
        nosort: true,
        nomount: true,
        nounique: false,
        nocase: true,
        nodir: true,
        nobrace: false,
        gitignore: true
      }, function processGlobResults(err, files) {
        if (err) {
          reject(new Error(`glob scan error: ${err}`));
          return;
        }

        if (DEBUG >= 1) console.log(`root point DIR --> scan: ${JSON.stringify(files, null, 2)}`);
        const rv = {
          markdown: new Map(),
          html: new Map(),
          css: new Map(),
          js: new Map(),
          image: new Map(),
          movie: new Map(),
          misc: new Map(),
          _: new Map()
        };
        const rv_mapping_def = {
          markdown: ['md', 'markdown'],
          html: ['html', 'htm'],
          js: ['js', 'mjs', 'ejs', 'ts', 'coffee'],
          css: ['css', 'scss', 'less', 'styl', 'stylus'],
          image: ['png', 'gif', 'jpg', 'jpeg', 'tiff', 'bmp', 'svg', 'psd', 'ai'],
          movie: ['mkv', 'mp4', 'avi', 'mov', 'flv']
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

        if (DEBUG >= 3) console.log('######################### mapping ##########################\n', rv_mapping, '\n###########################################');

        for (const p of files || []) {
          const f = unixify(path.resolve(p));
          if (DEBUG >= 9) console.log('hacky fix for glob output not being abs path on Windows:', {
            'in': p,
            out: f
          });
          const fname = path.basename(f.toLowerCase());
          const ext = path.extname(fname);
          const el = {
            path: f,
            nameLC: fname,
            ext: ext,
            relativePath: unixify(path.relative(config.docTreeBasedir, f)),
            destinationRelPath: null
          };
          const cat = rv_mapping.get(ext) || 'misc';
          rv[cat].set(f, el);

          rv._.set(f, el);
        }

        resolve(rv);
      });
    });
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

  if (DEBUG >= 1) console.log('setting up markdown-it:', mdPluginCollective, typeof mdPluginCollective.use_dirty_dozen);
  mdPluginCollective.use_dirty_dozen(md, {
    abbr: {
      abbreviations: readOptionalTxtConfigFile('.deGaulle/abbr-abbreviations.txt'),
      links: readOptionalTxtConfigFile('.deGaulle/abbr-links.txt'),
      emphasis: readOptionalTxtConfigFile('.deGaulle/abbr-emphasis-phrases.txt')
    },
    include: {
      root: '/includes/',
      getRootDir: (options, state, startLine, endLine) => state.env.getIncludeRootDir(options, state, startLine, endLine)
    },
    wikilinks: {
      postProcessPageName: function (pageName) {
        const rv = myCustomPageNamePostprocessor(pageName);
        if (DEBUG >= 1) console.log('wikilink transform:', {
          'in': pageName,
          out: rv
        });
        return rv;
      }
    }
  });
  const allFiles = await scan;
  if (DEBUG >= 2) console.log('!!!!!!!!!!!!!!!! allFiles:', allFiles);

  if (!allFiles.markdown.get(firstEntryPointPath) && !allFiles.html.get(firstEntryPointPath)) {
    throw new Error(`root file '${firstEntryPointPath}' is supposed to be part of the website`);
  }

  console.log(`processing root file: ${firstEntryPointPath}...`);
  const specRec = await compileMD(firstEntryPointPath, md, allFiles);
  if (DEBUG >= 10) console.log('specRec:', specRec); // now process the other MD files too:

  for (const slot of allFiles.markdown) {
    const key = slot[0];
    const entry = slot[1];
    entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length));
    if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! markdown file record:', entry);
    const specRec2 = await compileMD(key, md, allFiles);
    if (DEBUG >= 3) console.log('specRec:', specRec2);
    assert.strictEqual(specRec2, entry);
  } // now process the HTML files:


  for (const slot of allFiles.html) {
    const key = slot[0];
    const entry = slot[1];
    entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length));
    if (DEBUG >= 5) console.log('!!!!!!!!!!!!!!!!!!!!!!!! HTML file record:', entry);
    const specRec2 = await loadHTML(key, allFiles);
    if (DEBUG >= 3) console.log('specRec:', specRec2);
    assert.strictEqual(specRec2, entry);
  } // now process the CSS, JS and other 'fixed assets' files:
  //
  // [css, js, image, movie, misc, _]


  for (const type in allFiles) {
    switch (type) {
      case 'html':
      case 'markdown':
        continue;

      case 'css':
      case 'js':
        {
          const collection = allFiles[type];

          for (const slot of collection) {
            const key = slot[0];
            const entry = slot[1];
            entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length));
            if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, entry);
            const specRec2 = await loadFixedAssetTextFile(key, allFiles, collection);
            if (DEBUG >= 3) console.log('specRec:', specRec2);
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
            entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length));
            if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record:`, entry);
            const specRec2 = await loadFixedAssetBinaryFile(key, allFiles, collection);
            if (DEBUG >= 3) console.log('specRec:', specRec2);
            assert.strictEqual(specRec2, entry);
          }
        }
        continue;
    }
  } // now's the time to match the links in the generated content and do some linkage reporting alongside:
  //


  if (DEBUG >= 1) console.log('>>>>>>>>>>>>>>>>>>>> allFiles:', allFiles);
  if (DEBUG >= 1) console.log('markdown AST token types:', Object.keys(markdownTokens).sort());
}

async function compileMD(mdPath, md, allFiles) {
  console.log(`processing file: ${mdPath}...`);
  return new Promise((resolve, reject) => {
    fs.readFile(mdPath, {
      encoding: 'utf8'
    }, async (err, data) => {
      if (err) {
        reject(new Error(`ERROR: read error ${err} for file ${mdPath}`));
        return;
      }

      const env = {
        getIncludeRootDir: null
      };
      if (DEBUG >= 8) console.log('source:\n', data); // augment the md instance for use with the markdown_it_include plugin:

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
      if (DEBUG >= 10) console.log('tokens:\n', JSON.stringify(cleanTokensForDisplay(tokens), null, 2));
      const typeMap = new Set();
      traverseTokens(tokens, (t, idx, arr, depth) => {
        typeMap.add(t.type);
        markdownTokens[t.type] = true;
      });
      if (DEBUG >= 4) console.log('token types:', typeMap);

      const content = md.renderer.render(tokens, md.options, env);
      if (DEBUG >= 4) console.log('output:\n', content);
      const dom = new JSDOM('<html><head>\n' + content, {
        includeNodeLocations: true
      });
      const document = dom.window.document;
      const bodyEl = document.body; // implicitly created

      const headEl = document.querySelector('head');
      if (DEBUG >= 1) console.log('MARKDOWN:\n', {
        html: document,
        body: bodyEl.innerHTML,
        head: headEl.innerHTML
      }); // update the file record:

      const el = allFiles.markdown.get(mdPath);
      if (DEBUG >= 3) console.log('update the file record:', {
        mdPath,
        el
      });
      el.HtmlContent = content; //el.HtmlContent = bodyEl.innerHTML;

      el.HtmlHeadContent = headEl.innerHTML;
      el.HtmlBody = bodyEl;
      el.HtmlHead = headEl;
      resolve(el);
    });
  });
}

async function loadHTML(htmlPath, allFiles) {
  console.log(`processing file: ${htmlPath}...`);
  return new Promise((resolve, reject) => {
    fs.readFile(htmlPath, {
      encoding: 'utf8'
    }, async (err, data) => {
      if (err) {
        reject(new Error(`ERROR: read error ${err} for file ${htmlPath}`));
        return;
      }

      if (DEBUG >= 1) console.log('source:\n', data);
      const dom = new JSDOM(data, {
        includeNodeLocations: true
      });
      const document = dom.window.document;
      const bodyEl = document.body; // implicitly created

      const headEl = document.querySelector('head');
      if (DEBUG >= 1) console.log('HTML:\n', {
        html: document,
        body: bodyEl.innerHTML,
        head: headEl.innerHTML
      }); // update the file record:

      const el = allFiles.html.get(htmlPath);
      el.HtmlContent = bodyEl.innerHTML;
      el.HtmlHeadContent = headEl.innerHTML;
      el.HtmlBody = bodyEl;
      el.HtmlHead = headEl;
      resolve(el);
    });
  });
}

async function loadFixedAssetTextFile(filePath, allFiles, collection) {
  console.log(`processing file: ${filePath}...`);
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, {
      encoding: 'utf8'
    }, async (err, data) => {
      if (err) {
        reject(new Error(`ERROR: read error ${err} for file ${filePath}`));
        return;
      }

      if (DEBUG >= 1) console.log('source:\n', data); // update the file record:

      const el = collection.get(filePath);
      el.RawContent = data;
      resolve(el);
    });
  });
}

async function loadFixedAssetBinaryFile(filePath, allFiles, collection) {
  console.log(`processing file: ${filePath}...`);
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, {
      encoding: 'utf8'
    }, async (err, data) => {
      if (err) {
        reject(new Error(`ERROR: read error ${err} for file ${filePath}`));
        return;
      }

      if (DEBUG >= 1) console.log('source:\n', data); // update the file record:

      const el = collection.get(filePath);
      resolve(el);
    });
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
} // https://vuepress.vuejs.org/plugin/life-cycle.html#generated

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
//# sourceMappingURL=deGaulle.js.map
