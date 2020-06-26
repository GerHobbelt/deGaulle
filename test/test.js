/* eslint-env mocha, es6 */

const test = require('ava');
const path = require('path');
const generate = require('@gerhobbelt/markdown-it-testgen');

test('markdown-it-abbr', function (t) {
  const md = require('@gerhobbelt/markdown-it')({ linkify: true });

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
