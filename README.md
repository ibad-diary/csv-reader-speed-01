# csv-reader-speed-01

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ibad-diary/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ibad-diary/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: reads broken CSV files
exactly as csv-reader does, in a single pass.

Entry for the bounty: https://make.fun/bounty/csv-reader-speed-01-run-20261121

Referral code: `s67gjd7a`

## How it works

`solve.js` exports `run({ text, header })` returning
`{ columns, rows, errors }`. The parser is written from the bounty spec:

- one left-to-right pass, BOM dropped once, records end at LF or CRLF,
  empty lines are not records;
- stray CRs outside quotes are dropped (`stray_cr`);
- quoted fields run to the next non-doubled quote, `""` becomes one quote,
  CR/LF inside quotes becomes LF, junk after the closing quote is appended
  (`quote_junk`), a quote that never closes is literal and the rest is
  re-read as unquoted (`unterminated_quote`);
- rows are padded (`short_row`) or cut (`long_row`) to the first record's
  width.

Speed comes from slicing fields once instead of building them character
by character: unquoted fields are found with a tight `charCodeAt` scan,
quoted fields jump to the closing quote with `indexOf` and slice directly
when the body needs no normalisation. No dependencies, no WebAssembly.

`main.ts` turns V8 incremental marking off (as the house driver does),
reads `/input/cases.json`, answers every case with `run`, and writes
`/output/answers.json`.

## License

MIT — see `LICENSE`.
