//
//
//

var nomnom = require('@gerhobbelt/nomnom');
var pkg = require('../package.json');
var Glob = require('glob').Glob;

nomnom.script('deGaulle');

nomnom
  .command('build')
  .option('debug', {
    abbr: 'd',
    flag: true,
    help: 'Print debugging info'
  })
  .option('config', {
    abbr: 'c',
    default: 'config.json',
    help: 'JSON file with tests to run'
  })
  .callback(function (opts) {
    buildWebsite(opts.url);
  })
  .help('build website from sources');

nomnom
  .command('sanity')
  .option('debug', {
    abbr: 'd',
    flag: true,
    help: 'Print debugging info'
  })
  .option('config', {
    abbr: 'c',
    default: 'config.json',
    help: 'JSON file with tests to run'
  })
  .option('outfile', {
    abbr: 'o',
    help: 'file to write results to'
  })
  .callback(function (opts) {
    sanityCheck(opts.filename);
  })
  .help('run the sanity tests');

nomnom
  .nocommand()
  .option('debug', {
    abbr: 'd',
    flag: true,
    help: 'Print debugging info'
  })
  .option('config', {
    abbr: 'c',
    default: 'config.json',
    help: 'JSON file with tests to run'
  })
  .option('version', {
    flag: true,
    help: 'print version and exit',
    callback: function () {
      return `version ${pkg.version}`;
    }
  });

var opts = nomnom.parse();

if (opts.debug) {
  // do stuff
}

var mg = new Glob('**/*.*', {}, function (err, files) {
  // `files` is an array of filenames.
  // If the `nonull` option is set, and nothing
  // was found, then files is ["**/*.js"]
  // `err` is an error object or null.
});
