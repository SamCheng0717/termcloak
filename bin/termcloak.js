#!/usr/bin/env node

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/app.js';

const here = dirname(fileURLToPath(import.meta.url));
const demoPath = resolve(here, '../samples/demo.txt');

run(process.argv.slice(2), { demoPath }).catch((error) => {
  process.stderr.write(`termcloak: ${error.message}\n`);
  process.exitCode = 1;
});
