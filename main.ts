import { setFlagsFromString } from 'node:v8';
setFlagsFromString('--no-incremental-marking');
const { run } = await import('./solve.js');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(`${inDir}/cases.json`, 'utf8'));
const answers = cases.map((c) => run(c.input));
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/answers.json`, JSON.stringify(answers));
