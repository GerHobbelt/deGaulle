//
//
//

var Glob = require('glob').Glob;

var mg = new Glob('**/*.*', {}, function (err, files) {
  // `files` is an array of filenames.
  // If the `nonull` option is set, and nothing
  // was found, then files is ["**/*.js"]
  // `err` is an error object or null.
});
