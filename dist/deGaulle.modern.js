/*! deGaulle 1.0.0-1 https://github.com//GerHobbelt/deGaulle @license MIT */

//
//
//
const nomnom = require('@gerhobbelt/nomnom');

const MarkDown = require('@gerhobbelt/markdown-it');

const mdPluginCollective = require('markdown-it-dirty-dozen');

const pkg = require('../package.json');

const glob = require('glob');

const assert = require('assert');

const _ = require('lodash');

const path = require('path');

const fs = require('fs');
const config = {
  docTreeBasedir: null,
  destinationPath: null
};
nomnom.script('deGaulle');
nomnom.command('build').option('debug', {
  abbr: 'd',
  flag: true,
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
  flag: true,
  help: 'Print debugging info'
}).option('config', {
  abbr: 'c',
  'default': 'config.json',
  help: 'JSON file with tests to run'
}).option('outfile', {
  abbr: 'o',
  help: 'file to write results to'
}).callback(function (opts
/* , cmd */
) {
  try {
    sanityCheck(opts);
  } catch (ex) {
    console.error(`ERROR: ${ex.message}\n\nException:\n${ex}`);
    process.exit(5);
  }
}).help('run the sanity tests');
nomnom.nocommand().option('debug', {
  abbr: 'd',
  flag: true,
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
  let p = path.join(config.docTreeBasedir, rel);
  return unixify(path.resolve(p));
}

function readOptionalTxtConfigFile(rel) {
  let p = absSrcPath(rel);

  if (fs.existsSync(p)) {
    let src = fs.readFileSync(p, 'utf8'); // - split into lines
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
    let rv = {};
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
  spec = spec.replace(/ --+ /g, '/');
  spec = _.deburr(spec).trim(); // normalize case

  spec = spec.toLowerCase();
  spec = spec.replace(/[^\w\d\s\/_-]/g, '_');
  spec = spec.replace(/__+/g, '_');
  spec = spec.replace(/\s+/g, ' ');
  console.log('myCustomPageNamePostprocessor STAGE 1', spec);
  spec = spec.replace(/_-_/g, '_');
  spec = spec.replace(/ - /g, ' ');
  spec = spec.replace(/[ _]* [ _]*/g, ' ');
  console.log('myCustomPageNamePostprocessor STAGE 2', spec);
  spec = spec.replace(/(^|\/)[ _]+/g, '$1');
  spec = spec.replace(/[ _]+($|\/)/g, '$1');
  console.log('myCustomPageNamePostprocessor STAGE 3', spec);
  spec = spec.replace(/ /g, '.');
  console.log('myCustomPageNamePostprocessor STAGE 4', spec);
  return spec;
}

async function buildWebsite(opts, command) {
  console.log(`buildWebsite: command: ${command || '<no-command>'}, opts: ${JSON.stringify(opts, null, 2)}`);

  let paths = opts._.slice(command ? 1 : 0);

  const minPathsCount = 1;

  if (!paths || paths.length < minPathsCount) {
    throw new Error('Must specify at least one file path as starting point. None were specified.');
  }

  let firstEntryPointPath = paths[0]; // make sure we start with an absolute path; everything will derived off this one.

  if (!path.isAbsolute(firstEntryPointPath)) {
    firstEntryPointPath = path.join(process.cwd(), firstEntryPointPath);
  }

  firstEntryPointPath = path.normalize(firstEntryPointPath);
  console.log('firstEntryPointPath = ', firstEntryPointPath);
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
    console.log('scanPath:', scanPath);
    let files = glob.sync(scanPath, {
      nosort: true,
      nomount: true,
      nounique: false,
      //nocase: true,     //<-- uncomment this one for total failure to find any files >:-((
      nodir: true,
      nobrace: false,
      gitignore: true
    });
    console.log(`root point DIR --> scan: ${JSON.stringify(files, null, 2)}`);

    for (const f of files || []) {
      switch (path.basename(f.toLowerCase())) {
        case 'index.md':
          if (indexFilePriority < 10) {
            indexFilePriority = 10;
            indexFile = f;
          }

          continue;

        case 'index.htm':
        case 'index.html':
          if (indexFilePriority < 5) {
            indexFilePriority = 5;
            indexFile = f;
          }

          continue;

        case 'readme.md':
          if (indexFilePriority < 1) {
            indexFilePriority = 1;
            indexFile = f;
          }

          continue;

        default:
          continue;
      }
    }

    if (indexFile) {
      firstEntryPointPath = indexFile;
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

  outputDirPath = path.normalize(outputDirPath);
  console.log('outputDirPath = ', outputDirPath);
  config.destinationPath = outputDirPath;
  config.outputDirRelativePath = unixify(path.relative(config.docTreeBasedir, config.destinationPath));
  console.log('config:', config); // now scan the entire tree: collect potential files for comparison & treatment
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
    console.log('scanPath:', scanPath);
    return new Promise((resolve, reject) => {
      glob(scanPath, {
        nosort: true,
        nomount: true,
        nounique: false,
        //nocase: true,     //<-- uncomment this one for total failure to find any files >:-((
        nodir: true,
        nobrace: false,
        gitignore: true
      }, function processGlobResults(err, files) {
        if (err) {
          reject(new Error(`glob scan error: ${err}`));
          return;
        }

        console.log(`root point DIR --> scan: ${JSON.stringify(files, null, 2)}`);
        let rv = {
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
        let rv_mapping = new Map();

        for (let n in rv_mapping_def) {
          let a = rv_mapping_def[n];
          console.log('key n', {
            n,
            a
          });

          for (let b of a) {
            console.log('map n -> b', {
              n,
              b
            });
            rv_mapping.set('.' + b, n);
          }
        }

        console.log('######################### mapping ##########################\n', rv_mapping, '\n###########################################');

        for (const f of files || []) {
          let fname = path.basename(f.toLowerCase());
          let ext = path.extname(fname);
          let el = {
            path: f,
            nameLC: fname,
            ext: ext,
            relativePath: unixify(path.relative(config.docTreeBasedir, f))
          };
          let cat = rv_mapping.get(ext) || 'misc';
          rv[cat].set(f, el);

          rv._.set(f, el);
        }

        resolve(rv);
      });
    });
  } // async invocation, but don't wait for it yet:


  let scan = collectAllFiles();
  let md = MarkDown({
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
    highlight: function ()
    /*str, lang*/
    {
      console.error('highligh callback invoked!');
      return '';
    } // Configure default attributes for given tags
    //default_attributes: { a: [['rel', 'nofollow']] }

  }); // augment the md instance for use with the markdown_it_include plugin:
  //md.getIncludeRootDir = ...

  console.log('setting up markdown-it:', mdPluginCollective, typeof mdPluginCollective.use_dirty_dozen);
  mdPluginCollective.use_dirty_dozen(md, {
    abbr: {
      abbreviations: readOptionalTxtConfigFile('.deGaulle/abbr-abbreviations.txt'),
      links: readOptionalTxtConfigFile('.deGaulle/abbr-links.txt'),
      emphasis: readOptionalTxtConfigFile('.deGaulle/abbr-emphasis-phrases.txt')
    },
    include: {
      root: '/bogus/',
      getRootDir: (options, state, startLine, endLine) => state.env.getIncludeRootDir(options, state, startLine, endLine)
    },
    wikilinks: {
      postProcessPageName: myCustomPageNamePostprocessor
    }
  });
  let allFiles = await scan;

  if (!allFiles.markdown.get(firstEntryPointPath) && !allFiles.html.get(firstEntryPointPath)) {
    throw new Error(`root file '${firstEntryPointPath}' is supposed to be part of the website`);
  }

  console.log(`processing root file: ${firstEntryPointPath}...`);
  let specRec = await compileMD(firstEntryPointPath, md, allFiles);

  for (let slot of allFiles.markdown) {
    let key = slot[0];
    let entry = slot[1];
    entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length));

    if (!entry.HtmlContent) {
      let specRec2 = await compileMD(key, md, allFiles);
      assert.strictEqual(specRec2, entry);
    }
  } // now process the HTML files:


  for (let slot of allFiles.html) {
    let key = slot[0];
    let entry = slot[1];
    entry.destinationRelPath = myCustomPageNamePostprocessor(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length));

    if (!entry.HtmlContent) {
      let specRec2 = await loadHTML(key, allFiles);
      assert.strictEqual(specRec2, entry);
    }
  } // now's the time to match the links in the generated content and do some linkage reporting alongside:
  //

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

      let env = {};

      env.getIncludeRootDir = function (options, state, startLine, endLine) {
        return path.dirname(mdPath);
      }; // let content = md.render(data); --> .parse + .renderer.render
      //
      // .parse --> new state + process: return tokens
      // let tokens = md.parse(data, env)


      let state = new md.core.State(data, md, env);
      md.core.process(state);
      let tokens = state.tokens; //console.log('tokens:\n', JSON.stringify(cleanTokensForDisplay(tokens), null, 2));

      let typeMap = new Set();
      traverseTokens(tokens, (t, idx, arr, depth) => {
        typeMap.add(t.type);
      });
      console.log('token types:', typeMap);

      let content = md.renderer.render(tokens, md.options, env);

      let el = allFiles.markdown.get(mdPath);
      el.HtmlContent = content;
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

      let el = allFiles.html.get(htmlPath);
      el.HtmlContent = data;
      resolve(el);
    });
  });
}

function traverseTokens(tokens, cb, depth) {
  depth = depth || 0;

  for (let i = 0, len = tokens.length; i < len; i++) {
    let t = tokens[i];
    cb(t, i, tokens, depth);

    if (t.children) {
      traverseTokens(t.children, cb, depth + 1);
    }
  }
}
//# sourceMappingURL=deGaulle.modern.js.map
