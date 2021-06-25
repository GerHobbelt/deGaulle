/*! deGaulle 1.0.0-1 https://github.com//GerHobbelt/deGaulle @license MIT */

import sourceMapSupport from 'source-map-support';
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
sourceMapSupport.install();

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
var UrlMappingSource;

(function (UrlMappingSource) {
  UrlMappingSource[UrlMappingSource["SOURCED_BY_NOBODY"] = 0] = "SOURCED_BY_NOBODY";
  UrlMappingSource[UrlMappingSource["SOURCEFILE_NAME"] = 1] = "SOURCEFILE_NAME";
  UrlMappingSource[UrlMappingSource["WIKILINK_PAGENAME"] = 2] = "WIKILINK_PAGENAME";
  UrlMappingSource[UrlMappingSource["MARKDOWN_TRANSFORM"] = 3] = "MARKDOWN_TRANSFORM";
  UrlMappingSource[UrlMappingSource["SLUGIFICATION"] = 4] = "SLUGIFICATION";
  UrlMappingSource[UrlMappingSource["TITLE_EXTRACTION"] = 5] = "TITLE_EXTRACTION";
  UrlMappingSource[UrlMappingSource["POSTPROCESSING"] = 6] = "POSTPROCESSING";
})(UrlMappingSource || (UrlMappingSource = {}));
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
  }).callback((opts, cmd) => {
    handleAsyncFunction(async function () {
      try {
        await buildWebsite(opts, cmd);
      } catch (ex) {
        console.error(`ERROR: ${ex.message}\n\nException:\n`);
        console.error(ex);
        process.exit(5);
      }

      return true;
    });
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
  }).callback((opts, cmd) => {
    handleAsyncFunction(async function () {
      try {
        await sanityCheck(opts, cmd);
      } catch (ex) {
        console.error(`ERROR: ${ex.message}\n\nException:\n`);
        console.error(ex);
        process.exit(5);
      }

      return true;
    });
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
  }).callback((opts, cmd) => {
    handleAsyncFunction(async function () {
      try {
        await buildWebsite(opts, cmd);
      } catch (ex) {
        console.error(`ERROR: ${ex.message}\n\nException:\n`);
        console.error(ex);
        process.exit(5);
      }

      return true;
    });
  });
  nomnom.parse();
} // -- done --
// special function which accepts an async callback and waits for it,
// turning this call in a SYNCHRONOUS one. 
// Useful stuff when you're moving from sync code to async code
//
// Note: https://medium.com/@patarkf/synchronize-your-asynchronous-code-using-javascripts-async-await-5f3fa5b1366d#05ef

function handleAsyncFunction(f) {
  try {
    f().then(x => {
      console.log(x);
    }).catch(error => {
      console.log(error);
    });
  } catch (error) {
    console.log(error);
  }
}

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

function __slugify4pathelement(el) {
  // custom acronym replacements BEFORE we slugify for filesystem:
  // always surround these by '_' so they will stand out as before.
  // the remainder of this slugifier will take care of the potential
  // '_' duplicates, etc. in there...
  el = el.replace(/C\+\+/g, '_Cpp_'); // Now do the slugging...

  el = slug(el, {
    mode: 'filename',
    replacement: '_',
    allowed: /(?:(?![\x2D\.0-9A-Z_a-z~\xAA\xB2\xB3\xB5\xB9\xBA\xBC-\xBE\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u0660-\u0669\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07C0-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u08A0-\u08B4\u08B6-\u08C7\u0904-\u0939\u093D\u0950\u0958-\u0961\u0966-\u096F\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09E6-\u09F1\u09F4-\u09F9\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A66-\u0A6F\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AE6-\u0AEF\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B66-\u0B6F\u0B71-\u0B77\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0BE6-\u0BF2\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C66-\u0C6F\u0C78-\u0C7E\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CE6-\u0CEF\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D58-\u0D61\u0D66-\u0D78\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DE6-\u0DEF\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F20-\u0F33\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F-\u1049\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u1090-\u1099\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1369-\u137C\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u17E0-\u17E9\u17F0-\u17F9\u1810-\u1819\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A16\u1A20-\u1A54\u1A80-\u1A89\u1A90-\u1A99\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B50-\u1B59\u1B83-\u1BA0\u1BAE-\u1BE5\u1C00-\u1C23\u1C40-\u1C49\u1C4D-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2070\u2071\u2074-\u2079\u207F-\u2089\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2150-\u2189\u2460-\u249B\u24EA-\u24FF\u2776-\u2793\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2CFD\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u3192-\u3195\u31A0-\u31BF\u31F0-\u31FF\u3220-\u3229\u3248-\u324F\u3251-\u325F\u3280-\u3289\u32B1-\u32BF\u3400-\u4DBF\u4E00-\u9FFC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7BF\uA7C2-\uA7CA\uA7F5-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA830-\uA835\uA840-\uA873\uA882-\uA8B3\uA8D0-\uA8D9\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA900-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF-\uA9D9\uA9E0-\uA9E4\uA9E6-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA50-\uAA59\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABE2\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD07-\uDD33\uDD40-\uDD78\uDD8A\uDD8B\uDE80-\uDE9C\uDEA0-\uDED0\uDEE1-\uDEFB\uDF00-\uDF23\uDF2D-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC58-\uDC76\uDC79-\uDC9E\uDCA7-\uDCAF\uDCE0-\uDCF2\uDCF4\uDCF5\uDCFB-\uDD1B\uDD20-\uDD39\uDD80-\uDDB7\uDDBC-\uDDCF\uDDD2-\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE35\uDE40-\uDE48\uDE60-\uDE7E\uDE80-\uDE9F\uDEC0-\uDEC7\uDEC9-\uDEE4\uDEEB-\uDEEF\uDF00-\uDF35\uDF40-\uDF55\uDF58-\uDF72\uDF78-\uDF91\uDFA9-\uDFAF]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2\uDCFA-\uDD23\uDD30-\uDD39\uDE60-\uDE7E\uDE80-\uDEA9\uDEB0\uDEB1\uDF00-\uDF27\uDF30-\uDF45\uDF51-\uDF54\uDFB0-\uDFCB\uDFE0-\uDFF6]|\uD804[\uDC03-\uDC37\uDC52-\uDC6F\uDC83-\uDCAF\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD03-\uDD26\uDD36-\uDD3F\uDD44\uDD47\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDD0-\uDDDA\uDDDC\uDDE1-\uDDF4\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDEF0-\uDEF9\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC50-\uDC59\uDC5F-\uDC61\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE50-\uDE59\uDE80-\uDEAA\uDEB8\uDEC0-\uDEC9\uDF00-\uDF1A\uDF30-\uDF3B]|\uD806[\uDC00-\uDC2B\uDCA0-\uDCF2\uDCFF-\uDD06\uDD09\uDD0C-\uDD13\uDD15\uDD16\uDD18-\uDD2F\uDD3F\uDD41\uDD50-\uDD59\uDDA0-\uDDA7\uDDAA-\uDDD0\uDDE1\uDDE3\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE89\uDE9D\uDEC0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC50-\uDC6C\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46\uDD50-\uDD59\uDD60-\uDD65\uDD67\uDD68\uDD6A-\uDD89\uDD98\uDDA0-\uDDA9\uDEE0-\uDEF2\uDFB0\uDFC0-\uDFD4]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD81C-\uD820\uD822\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879\uD880-\uD883][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF50-\uDF59\uDF5B-\uDF61\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDE40-\uDE96\uDF00-\uDF4A\uDF50\uDF93-\uDF9F\uDFE0\uDFE1\uDFE3]|\uD821[\uDC00-\uDFF7]|\uD823[\uDC00-\uDCD5\uDD00-\uDD08]|\uD82C[\uDC00-\uDD1E\uDD50-\uDD52\uDD64-\uDD67\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD834[\uDEE0-\uDEF3\uDF60-\uDF78]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD838[\uDD00-\uDD2C\uDD37-\uDD3D\uDD40-\uDD49\uDD4E\uDEC0-\uDEEB\uDEF0-\uDEF9]|\uD83A[\uDC00-\uDCC4\uDCC7-\uDCCF\uDD00-\uDD43\uDD4B\uDD50-\uDD59]|\uD83B[\uDC71-\uDCAB\uDCAD-\uDCAF\uDCB1-\uDCB4\uDD01-\uDD2D\uDD2F-\uDD3D\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD83C[\uDD00-\uDD0C]|\uD83E[\uDFF0-\uDFF9]|\uD869[\uDC00-\uDEDD\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uD884[\uDC00-\uDF4A])[\s\S])/g
  }); // no mutiple dots allowed: 
  // Dots are only tolerated in the inner sanctum of the directory name,
  // OR a single dot at the START of the name.
  // Nor do we tolerate tildes anywhere but at the start, and then ONE ONLY.
  // Dashes are okay, as long they appear in the inner sanctum only.
  // Underscores must not appear in groups either and are okay in the inner sanctum only.
  // Also, of all the ones we tolerate at the START, only a SINGLE ONE is permitted.
  // No riffing off .~_no_shall_do! We're a _Serious_ lot here!

  let start = /^[.~]/.exec(el);
  el = el.replace(/[_~.-][_~.-]+/g, '_') // ellipsis, etc. --> '_'
  .replace(/^[_~.-]/g, '').replace(/[_~.-]$/g, '');

  if (start) {
    el = start[0] + el;
  }

  return el;
}

function slugify4Path(filePath) {
  // slugify each path element individually so the '/' path separators don't get munched in the process!
  let elems = unixify(filePath).split('/');
  elems = elems.map(el => __slugify4pathelement(el));
  return elems.join('/');
}

function slugify4PathExt(fileExtension) {
  // the leading dot will automatically be stripped! 
  let dot = fileExtension.startsWith('.');

  if (dot) {
    fileExtension = fileExtension.slice(1);
  } // no dots allowed in a (stripped) file extension!


  fileExtension = fileExtension.replace(/[.]/g, '_');
  fileExtension = __slugify4pathelement(fileExtension);

  if (fileExtension.length) {
    if (dot) return '.' + fileExtension;else return fileExtension;
  }

  return '';
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

const pathMapping = new Map();

function registerPathMapping(mapRecord) {
  let key = mapRecord.source; // sanity checks before we register anything:
  // do not register entries which map a source onto itself to prevent cycles:

  if (mapRecord.source === mapRecord.target) return;
  if (mapRecord.source == null) return;

  if (pathMapping.has(key)) {
    let oldRec = pathMapping.get(key);
    if (mapRecord.source === oldRec.source && mapRecord.target === oldRec.target) return; // no change, don't bother about it

    if (mapRecord.source === oldRec.source) {
      // an update!
      registerPathMapping({
        originator: mapRecord.originator + 100,
        source: oldRec.target,
        target: mapRecord.target
      });
      return; // no change, don't bother about it
    }

    console.log('WARNING: pathMapping key collision:', {
      key,
      mapRecord,
      oldRec
    });
    throw new Error(`pathMapping key '${key}' has already been defined previously: ${JSON.stringify(oldRec)} vs. ${JSON.stringify(mapRecord)}`);
  }

  pathMapping.set(key, mapRecord);
}

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
      // make sure `import` sees a './'-based relative path, or it barfs a hairball as it will treat the base directory as a package identifier instead!
      configScript = unixify(path.join(process.cwd(), configScript));
    }

    if (DEBUG >= 1) console.log(`loadConfigScript(prepped: '${configScript}')`);

    try {
      const processors = await import('file://' + configScript);
      console.log("processors keys:", Object.keys(processors));
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
    let srcPath1 = paths[0];

    if (!path.isAbsolute(srcPath1)) {
      // make path absolute
      srcPath1 = unixify(path.join(process.cwd(), srcPath1));
    }

    const searchDirList = [unixify(path.join(srcPath1, '.deGaulle')), unixify(path.join(process.cwd(), '.deGaulle')), unixify(srcPath1), unixify(process.cwd())];

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
    const basePath = unixify(path.resolve(baseDirPath));
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
    const rv = {
      filesToProcess: [],
      directoriesProcessed: [],
      directoriesToIgnore: [],
      ignoreFilePaths: [],
      ignoreInfo: null
    };
    const ignoreContent = [];

    for (const p of files || []) {
      const el = mkIgnoreFileRecord(p);
      ignoreContent.push(fs.readFileSync(el.path, 'utf8'));
      rv.ignoreFilePaths.push(el);
    } // Now that we have collected all ignore files' content, we can
    // check if there's anything useful in there and compile that
    // for further use later on.


    const str = ignoreContent.join('\n\n\n').trim();

    if (str.length > 0) {
      // at least there's something to parse today...
      const gitignoreData = gitignoreParser.compile(str);
      const rec = {
        directoryPath: basePath,
        compiledIgnoreData: gitignoreData,
        parentRecord: null // we don't know yet if this directory has a parent with gitignore data...

      };
      rv.ignoreInfo = rec;
    }

    return rv;
  }

  function isPathAcceptedByIgnoreRecords(path, ignoreRecord) {
    if (!ignoreRecord || !ignoreRecord.compiledIgnoreData) {
      return true;
    } // gitignore rules: when a child gitignore file has something to say
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
    const basePath = path.resolve(baseDirPath);
    let scanPath = path.join(basePath, '*');
    scanPath = unixify(scanPath);
    if (DEBUG >= 8) console.log('scanPath:', scanPath);
    const globConfig = Object.assign({}, globDefaultOptions, {
      nodir: false,
      mark: true
    });
    assert(scanPath != null);
    const files = await globDirectory(scanPath, globConfig); // collect all the local ignore files.

    const dirscanInfo = await collectAllIgnoreFilesInDirectory(basePath);
    let activeIgnoreRecord = dirscanInfo.ignoreInfo; // hook up the parent if there's any

    if (activeIgnoreRecord && parentIgnores) {
      activeIgnoreRecord.parentRecord = parentIgnores;
    } // otherwise, when we have no ignore record of our own, use the parent as-is
    else if (!activeIgnoreRecord) {
        activeIgnoreRecord = parentIgnores;
      }

    const directoriesToScan = [];

    for (const p of files || []) {
      // skip the entries which are NOT directories?
      // Nah, keep them around for the ignore check that comes next:
      const isDir = p.endsWith('/');
      const d = mkIgnoreFileRecord(p);
      const ok = isPathAcceptedByIgnoreRecords(d.path, activeIgnoreRecord); // NOTE: the ignore files are themselves *ignored by default*:
      // dot-files are all ignored always.

      if (DEBUG >= 8) console.log(`isPathAcceptedByIgnoreRecords("${d.path}") --> pass: ${ok}, isDir: ${isDir}`); // when the entry is to be ignored, we add it to the list:

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
      const rv = await collectAllExceptIgnoredInDirectory(p, activeIgnoreRecord);
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
    const files = await collectAllExceptIgnoredInDirectory(basePath, null);
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
    const fpath = fileInfo.path;
    const fname = fileInfo.name;

    if (!fname) {
      console.error('AddFileToCollection:', fileInfo);
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
        }); // TODO: check existence of target and report error + suggestion if absent!

        registerPathMapping({
          originator: UrlMappingSource.WIKILINK_PAGENAME,
          source: pageName,
          target: rv
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
            assert.strictEqual(specRec2, entry); // special treatment for the getsatisfaction.com collective:

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
            const key = slot[0];
            const entry = slot[1];
            entry.destinationRelPath = slugify4Path(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + slugify4PathExt(entry.ext);
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
            entry.destinationRelPath = slugify4Path(entry.relativePath.slice(0, entry.relativePath.length - entry.ext.length)) + slugify4PathExt(entry.ext);
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
  console.log('Making sure all site files have unique (non-colliding) targets...'); // Thanks to the slugification of the destination file paths, we MAY have ended up with a bunch
  // of collisions!

  {
    const collisionCheckMap = new Map();

    function mk_unique_path(filePath, list) {
      let ext = path.extname(filePath);
      let name = filePath.slice(0, filePath.length - ext.length);
      let seqnum = 2;

      for (;;) {
        let testPath = name + `_${seqnum}` + ext;
        if (!list.has(testPath)) return testPath;
      }
    }

    for (const type in allFiles) {
      switch (type) {
        case '_':
          continue;

        case 'markdown':
        case 'html':
        case 'css':
        case 'js':
        default:
          {
            const collection = allFiles[type];

            for (const slot of collection) {
              const entry = slot[1];
              let pathkey = entry.destinationRelPath; // only *.js and [misc] files can have aleading dot in their filename;
              // the other CANNOT. (html, css, md, etc. cannot have leading dots as they
              // never sanely serve a purpose where they should/must be hidden in a directory)

              if (type !== 'js' && type !== 'misc') {
                pathkey = pathkey.replace(/\/[.]([^\/]*)$/, '/_$1');
                entry.destinationRelPath = pathkey;
              }

              if (collisionCheckMap.has(pathkey)) {
                let old = collisionCheckMap.get(pathkey);
                console.log("WARNING: collision for ", old, "vs.", slot);
                entry.destinationRelPath = mk_unique_path(pathkey, collisionCheckMap);
              } // only now that we've guaranteed that we have unique destination paths, can we 
              // safely and sanely register the mapping of source to destination:


              registerPathMapping({
                originator: UrlMappingSource.SOURCEFILE_NAME,
                source: entry.relativePath,
                target: entry.destinationRelPath
              });
            }
          }
          continue;
      }
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
            var _entry$metaData, _entry$metaData$front, _entry$metaData2, _entry$metaData3, _entry$metaData3$fron, _entry$metaData4, _entry$metaData5, _entry$metaData6, _entry$metaData6$fron;
            const entry = slot[1];
            const destFilePath = unixify(path.join(opts.output, entry.destinationRelPath));
            if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record: copy '${entry.path}' --> '${destFilePath}'`);
            filterHtmlHeadAfterMetadataExtraction(entry); // re title: frontMatter should have precedence over any other title source, including the title extracted from the document via H1

            const pathTitle = sanitizePathTotitle(path.basename(entry.relativePath, entry.ext));
            let title = (((_entry$metaData = entry.metaData) == null ? void 0 : (_entry$metaData$front = _entry$metaData.frontMatter) == null ? void 0 : _entry$metaData$front.title) || ((_entry$metaData2 = entry.metaData) == null ? void 0 : _entry$metaData2.docTitle) || pathTitle).trim(); // help ourselves mapping wikilink slots in other pages to this page:

            registerPathMapping({
              originator: UrlMappingSource.TITLE_EXTRACTION,
              source: (_entry$metaData3 = entry.metaData) == null ? void 0 : (_entry$metaData3$fron = _entry$metaData3.frontMatter) == null ? void 0 : _entry$metaData3$fron.title,
              target: entry.destinationRelPath
            });
            registerPathMapping({
              originator: UrlMappingSource.TITLE_EXTRACTION,
              source: (_entry$metaData4 = entry.metaData) == null ? void 0 : _entry$metaData4.docTitle,
              target: entry.destinationRelPath
            });
            registerPathMapping({
              originator: UrlMappingSource.TITLE_EXTRACTION,
              source: pathTitle,
              target: entry.destinationRelPath
            }); // clean up the title:

            title = title.replace(/:+$/, '') // remove trailing ':' colons
            .replace(/\s*[?]+/g, '?') // replace reams of question marks with a single '?'
            .trim();
            if (DEBUG >= 2) console.log('TITLE extraction:', {
              sourcePath: entry.relativePath,
              meta: entry.metaData,
              docTitle: (_entry$metaData5 = entry.metaData) == null ? void 0 : _entry$metaData5.docTitle,
              fmTitle: (_entry$metaData6 = entry.metaData) == null ? void 0 : (_entry$metaData6$fron = _entry$metaData6.frontMatter) == null ? void 0 : _entry$metaData6$fron.title,
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
    <style>
.container {
    margin: 0 auto;
    padding: 0 1rem;
    max-width: 65rem;
}    
    </style>
    ${htmlHead.html()}
  </head>
  <body>
    ${fm || ''}

    <article class="container">
    ${htmlBody.html()}
    </article>

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
  } // assistive files & dumps:


  console.log('pathMapping dictionary:', pathMapping.values());
  {
    const destFilePath = unixify(path.join(opts.output, 'deGaulle.linkMappings'));
    fs.writeFileSync(destFilePath, JSON.stringify(Array.from(pathMapping.values()), null, 2), 'utf8'); // also produce a source->target mapping file:

    const sourceTargetMap = [];

    for (const type in allFiles) {
      switch (type) {
        case '_':
          continue;

        case 'html':
        case 'markdown':
        case 'css':
        case 'js':
        default:
          {
            const collection = allFiles[type];

            for (const slot of collection) {
              const entry = slot[1];
              const _destFilePath = entry.destinationRelPath;
              const originalPath = entry.relativePath;
              sourceTargetMap.push({
                source: originalPath,
                target: _destFilePath
              });
            }
          }
          continue;
      }
    }

    const destFilePath2 = unixify(path.join(opts.output, 'deGaulle.sourceMappings'));
    fs.writeFileSync(destFilePath2, JSON.stringify(sourceTargetMap, null, 2), 'utf8');
  } // now fixup all links:

  console.log('Updating / Fixing all internal links...');

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
            const entry = slot[1];
            const destFilePath = unixify(path.join(opts.output, entry.destinationRelPath));
            if (DEBUG >= 5) console.log(`!!!!!!!!!!!!!!!!!!!!!!!! Type [${type}] file record: copy '${entry.path}' --> '${destFilePath}'`);
            const originalPath = entry.relativePath; //entry.HtmlDocument = $doc;
            //entry.HtmlBody = bodyEl;
            //entry.HtmlHead = headEl;
            //const linkCollection = getLinks($doc, entry.destinationRelPath);

            if (DEBUG >= 3) console.log('update the file record after fixup of the links:', {
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

        if (t.__link) {
          //console.log("MD link record?:", t);
          registerPathMapping({
            originator: UrlMappingSource.MARKDOWN_TRANSFORM,
            source: t.__link.url,
            target: t.__linkTargetUrl
          });
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
    const headEl = el.HtmlHead;
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
