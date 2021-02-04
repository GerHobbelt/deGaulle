/* eslint-env mocha, es6 */

import test from 'ava';
import path from 'path';
import generate from '@gerhobbelt/markdown-it-testgen';
import markdown_it from '@gerhobbelt/markdown-it';

import { fileURLToPath } from 'url';

// see https://nodejs.org/docs/latest-v13.x/api/esm.html#esm_no_require_exports_module_exports_filename_dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test('markdown-it-abbr', function (t) {
  const md = markdown_it({ linkify: true });

  generate.load(path.join(__dirname, 'fixtures/abbr.txt'), {}, function (data) {
    t.pass();
  });
});

test.failing('will fail (expected failure)', t => {
  t.fail();
});

if (0) {
  test.only('will be the only test run', t => {
    t.pass();
  });
}

async function promiseFn() {
  console.log('starting fast promise');
  return new Promise(resolve => {
    setTimeout(function () {
      resolve('fast');
      console.log('fast promise is done');
    }, 1000);
  });
}

test('async base test', async function (t) {
  const value = await promiseFn();
  console.error('awaited value = ', value);
  t.true(value === 'fast');
  return t;
});

// Async arrow function
test('promises the truth', async t => {
  const value = await promiseFn();
  console.error('awaited value = ', value);
  t.true(value === 'fast');
});

test.cb('data.txt can be read', t => {
  // `t.end` automatically checks for error as first argument
  //fs.readFile('data.txt', t.end);
  t.end();
});

test.todo('will think about writing this later');
