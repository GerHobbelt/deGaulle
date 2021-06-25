/*! deGaulle 1.0.0-1 https://github.com//GerHobbelt/deGaulle @license MIT */

import sourceMapSupport from 'source-map-support';
import nomnom from '@gerhobbelt/nomnom';
import '@gerhobbelt/slug';
import 'js-yaml';
import '@gerhobbelt/markdown-it';
import 'markdown-it-dirty-dozen';
import { fileURLToPath } from 'url';
import 'cheerio';
import '@gerhobbelt/glob';
import '@gerhobbelt/gitignore-parser';
import assert from 'assert';
import path from 'path';
import fs from 'fs';

//
sourceMapSupport.install();

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.normalize(path.join(__dirname, '../package.json')), 'utf8'));
let DEBUG = 1;
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
  }).callback(async function (opts, cmd) {
    try {
      await buildWebsite(opts, cmd);
    } catch (ex) {
      console.error(`ERROR: ${ex.message}\n\nException:\n`);
      console.error(ex);
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
      throw 1;
      return processors;
    } catch (err) {
      console.error('######## ERROR: ', err); //throw new AggregateError([ err ], `Cannot open/load config script file '${configScript}'`);

      throw new Error(`Cannot open/load config script file '${configScript}'. Error: ${err}`);
    }
  } else {
    return new Promise((resolve, reject) => {
      const processors = {
        default: function nil() {// no op
        }
      };
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

async function buildWebsite(opts, command) {
  console.log(`buildWebsite: command: ${command || '<no-command>'}, opts: ${JSON.stringify(opts, null, 2)}`);
  DEBUG = Math.max(DEBUG, Number.isFinite(+opts.debug) ? +opts.debug : opts.debug ? 1 : 0);
  console.log('DEBUG = ', DEBUG);

  const paths = opts._.slice(command ? 1 : 0);

  const minPathsCount = 1;
  console.log('SOURCE PATHS = ', paths);

  if (!paths || paths.length < minPathsCount) {
    throw new Error('Must specify at least one file path as starting point. None were specified.');
  } // load the config script, iff it exists:


  let configScript = opts.config; // look for config script in this order:
  // - source path #1 /.deGaulle/
  // - current directory /.deGaulle/
  // - source path #1 /
  // - current directory /
  //
  // we look at `source path #1/` relatively *late* in the game to prevent
  // clashes with a config.js that might be located there for other purposes,
  // e.g. as part of the website itself.
  //

  if (!path.isAbsolute(configScript)) {
    const searchDirList = [unixify(path.join(paths[0], '.deGaulle')), unixify(path.join(process.cwd(), '.deGaulle')), unixify(paths[0]), unixify(process.cwd())];

    for (let p of searchDirList) {
      let cfgpath = unixify(path.join(p, configScript));
      if (DEBUG >= 1) console.log(`Looking in ${cfgpath} for CONFIG FILE.`);

      if (fs.existsSync(cfgpath)) {
        configScript = cfgpath;
        break;
      }
    }
  }

  let processors = null;

  try {
    processors = await loadConfigScript(configScript);
  } catch (err) {
    console.error('##### ERROR while importing config script. (Will continue with a default script.)\nError: ', err);
    processors = await loadConfigScript(null);
  }

  if (DEBUG >= 1) console.log('config/processors STRUCT:', processors);
  assert(processors.default != null);
  assert(typeof processors.default === 'function', `configScript "${configScript}" is supposed to define at least a 'default' processor function`);
  if (DEBUG >= 1) console.log('configScript.processors = ', processors);
  let firstEntryPointPath = paths[0]; // make sure we start with an absolute path; everything will derive off this one.

  if (!path.isAbsolute(firstEntryPointPath)) {
    firstEntryPointPath = path.join(process.cwd(), firstEntryPointPath);
  }

  firstEntryPointPath = unixify(path.normalize(firstEntryPointPath));
  if (DEBUG >= 1) console.log('firstEntryPointPath = ', firstEntryPointPath);
  fs.lstatSync(firstEntryPointPath);
  throw 2;
} // compile the MarkDown files to a token stream. Belay *rendering* until all files, including the HTML files out there,
//   .then(() => {
//      console.log('done');
//   })
//   .catch(err => {
//     console.error('error:', err);
//   });

export default main;
//# sourceMappingURL=deGaulle.js.map
