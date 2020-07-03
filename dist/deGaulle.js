/*! deGaulle 1.0.0-1 https://github.com//GerHobbelt/deGaulle @license MIT */

'use strict';

// https://vuepress.vuejs.org/plugin/life-cycle.html#generated

//
//
//
const nomnom = require('@gerhobbelt/nomnom');

const MarkDown = require('@gerhobbelt/markdown-it');

const mdPluginCollective = require('markdown-it-dirty-dozen');

const pkg = require('../package.json');

const glob = require('globby');

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

function absSrcPath(rel) {
  let p = path.join(config.docTreeBasedir, rel);
  return path.resolve(p);
}

function readTxtConfigFile(rel) {
  let p = path.resolve(absSrcPath(rel));
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

function buildWebsite(opts, command) {
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
    scanPath = scanPath.replace(/\\/g, '/');
    console.log('scanPath:', scanPath);
    let files = glob.sync(scanPath, {
      nosort: true,
      nocase: true,
      nodir: true,
      nobrace: false
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
  console.log('config:', config);
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

  });
  console.log('setting up markdown-it:', mdPluginCollective, typeof mdPluginCollective.use_dirty_dozen);
  mdPluginCollective.use_dirty_dozen(md, {
    abbr: {
      abbreviations: readTxtConfigFile('.deGaulle/abbr-abbreviations.txt'),
      links: readTxtConfigFile('.deGaulle/abbr-links.txt'),
      emphasis: readTxtConfigFile('.deGaulle/abbr-emphasis-phrases.txt')
    },
    include: {
      root: absSrcPath('.')
    }
  });
  console.log(`processing root file: ${firstEntryPointPath}...`);
  fs.readFile(firstEntryPointPath, {
    encoding: 'utf8'
  }, (err, data) => {
    if (err) {
      throw new Error(`ERROR: read error ${err} for file ${firstEntryPointPath}`);
    }

    let env = {};
    console.log('source:\n', data); // let content = md.render(data); --> .parse + .renderer.render
    //
    // .parse --> new state + process: return tokens
    // let tokens = md.parse(data, env)

    let state = new md.core.State(data, md, env);
    md.core.process(state);
    let tokens = state.tokens;
    console.log('tokens:\n', JSON.stringify(cleanTokensForDisplay(tokens), null, 2));
    let content = md.renderer.render(tokens, md.options, env);
    console.log('output:\n', content);
  });
}

function cleanTokensForDisplay(tokens) {
  let rv = [];

  for (let i in tokens) {
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
  let rv = {};

  for (let attr in token) {
    if (token[attr] !== '' && token[attr] != null) {
      rv[attr] = token[attr];
    }
  }

  return rv;
}
//# sourceMappingURL=deGaulle.js.map
