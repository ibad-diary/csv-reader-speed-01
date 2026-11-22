// Fast drop-in for csv-reader 1.0.0: reads broken CSV exactly per the
// competition spec. Single pass, minimal allocation: unquoted fields and
// quote junk are found with a tight charCodeAt scan and sliced once;
// quoted fields jump to the closing quote with indexOf and slice when
// the content needs no normalisation.
//
// Input:  { text, header }
// Output: { columns, rows, errors }
//   errors are { code, line, row } (+ fields for short_row, + extra for
//   long_row); line is always the 1-based line the record starts on,
//   row the record's index in rows (null for the header record).

export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xFEFF) i = 1; // drop one leading BOM

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let line = 1;
  let recCount = 0;

  // Normalise one quoted-field body [a, b): "" -> ", CRLF / lone CR / LF
  // -> LF, counting each line break. Called only when the body is dirty.
  const buildQuoted = (a, b) => {
    const parts = [];
    let p = a;
    let q = a;
    while (q < b) {
      const c = text.charCodeAt(q);
      if (c === 34) { // "" pair (every quote in here is one: the scan proved it)
        parts.push(text.slice(p, q), '"');
        q += 2; p = q;
      } else if (c === 13) {
        line++;
        parts.push(text.slice(p, q), '\n');
        q += (text.charCodeAt(q + 1) === 10) ? 2 : 1;
        p = q;
      } else if (c === 10) {
        line++;
        parts.push(text.slice(p, q), '\n');
        q++; p = q;
      } else {
        q++;
      }
    }
    parts.push(text.slice(p, b));
    return parts.join('');
  };

  for (;;) {
    // Skip empty lines and stray CRs before the next record. Errors here
    // belong to the upcoming record (same line, same row index).
    const recRow = header ? (recCount === 0 ? null : recCount - 1) : recCount;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 10) { i++; line++; continue; }
      if (c === 13) {
        if (text.charCodeAt(i + 1) === 10) { i += 2; line++; continue; }
        errors.push({ code: 'stray_cr', line, row: recRow });
        i++;
        continue;
      }
      break;
    }
    if (i >= n) break;

    const recStartLine = line;
    const fields = [];
    let endKind = 0; // 0 comma, 1 LF, 2 CRLF, 3 EOF (record terminator)

    for (;;) {
      // ---- parse one field starting at i ----
      let value;
      let handled = false;
      let s = i;
      let pre = '';
      if (text.charCodeAt(i) === 34) {
        // Quoted field: find the next quote that is not doubled.
        let j = text.indexOf('"', i + 1);
        let hasEsc = false;
        while (j !== -1 && text.charCodeAt(j + 1) === 34) {
          hasEsc = true;
          j = text.indexOf('"', j + 2);
        }
        if (j !== -1) {
          let content;
          const nl = text.indexOf('\n', i + 1);
          // Is there a CR inside the body? Bounded scan: indexOf('\r')
          // would run past the body to the next CR anywhere in the text.
          let hasCR = false;
          for (let q = i + 1; q < j; q++) {
            if (text.charCodeAt(q) === 13) { hasCR = true; break; }
          }
          if (!hasEsc && (nl === -1 || nl >= j) && !hasCR) {
            content = text.slice(i + 1, j);
          } else if (!hasEsc && !hasCR) {
            // Only LF breaks inside: value is the raw slice, just count them.
            content = text.slice(i + 1, j);
            let cnt = 0;
            let q = nl;
            while (q !== -1 && q < j) { cnt++; q = text.indexOf('\n', q + 1); }
            line += cnt;
          } else if (hasEsc && (nl === -1 || nl >= j) && !hasCR) {
            // Only "" escapes: native split/join, no line breaks.
            content = text.slice(i + 1, j).split('""').join('"');
          } else {
            content = buildQuoted(i + 1, j);
          }
          // Junk after the closing quote, up to comma / line break / EOF.
          let junkParts = null;
          let jseg = j + 1;
          let k = j + 1;
          let junk = '';
          for (;;) {
            while (k < n) {
              const c = text.charCodeAt(k);
              if (c === 44 || c === 10 || c === 13) break;
              k++;
            }
            if (k >= n) {
              if (junkParts) { junkParts.push(text.slice(jseg, k)); junk = junkParts.join(''); }
              else junk = text.slice(jseg, k);
              endKind = 3; i = k; break;
            }
            const c = text.charCodeAt(k);
            if (c === 44) {
              if (junkParts) { junkParts.push(text.slice(jseg, k)); junk = junkParts.join(''); }
              else junk = text.slice(jseg, k);
              endKind = 0; i = k + 1; break;
            }
            if (c === 10) {
              if (junkParts) { junkParts.push(text.slice(jseg, k)); junk = junkParts.join(''); }
              else junk = text.slice(jseg, k);
              endKind = 1; i = k + 1; break;
            }
            if (text.charCodeAt(k + 1) === 10) {
              if (junkParts) { junkParts.push(text.slice(jseg, k)); junk = junkParts.join(''); }
              else junk = text.slice(jseg, k);
              endKind = 2; i = k + 2; break;
            }
            // Stray CR inside junk: dropped, error first, junk continues.
            errors.push({ code: 'stray_cr', line: recStartLine, row: recRow });
            if (!junkParts) junkParts = [text.slice(jseg, k)];
            else junkParts.push(text.slice(jseg, k));
            k++; jseg = k;
          }
          if (junk.length > 0) {
            value = content + junk;
            errors.push({ code: 'quote_junk', line: recStartLine, row: recRow });
          } else {
            value = content;
          }
          handled = true;
        } else {
          // Never closes: literal quote, re-read the rest as unquoted.
          errors.push({ code: 'unterminated_quote', line: recStartLine, row: recRow });
          pre = '"';
          s = i + 1;
        }
      }

      if (!handled) {
        // ---- unquoted field from s, with literal prefix pre ----
        let parts = null;
        let seg = s;
        let k = s;
        let v;
        for (;;) {
          while (k < n) {
            const c = text.charCodeAt(k);
            if (c === 44 || c === 10 || c === 13) break;
            k++;
          }
          if (k >= n) {
            if (parts) { parts.push(text.slice(seg, k)); v = parts.join(''); }
            else v = pre === '' ? text.slice(seg, k) : pre + text.slice(seg, k);
            endKind = 3; i = k; break;
          }
          const c = text.charCodeAt(k);
          if (c === 44) {
            if (parts) { parts.push(text.slice(seg, k)); v = parts.join(''); }
            else v = pre === '' ? text.slice(seg, k) : pre + text.slice(seg, k);
            endKind = 0; i = k + 1; break;
          }
          if (c === 10) {
            if (parts) { parts.push(text.slice(seg, k)); v = parts.join(''); }
            else v = pre === '' ? text.slice(seg, k) : pre + text.slice(seg, k);
            endKind = 1; i = k + 1; break;
          }
          if (text.charCodeAt(k + 1) === 10) {
            if (parts) { parts.push(text.slice(seg, k)); v = parts.join(''); }
            else v = pre === '' ? text.slice(seg, k) : pre + text.slice(seg, k);
            endKind = 2; i = k + 2; break;
          }
          // Stray CR: dropped, error first, field continues.
          errors.push({ code: 'stray_cr', line: recStartLine, row: recRow });
          if (!parts) parts = [pre === '' ? text.slice(seg, k) : pre + text.slice(seg, k)];
          else parts.push(text.slice(seg, k));
          k++; seg = k;
        }
        value = v;
      }

      fields.push(value);
      if (endKind === 0) continue; // comma: next field
      break; // record ends
    }

    if (endKind === 1 || endKind === 2) line++;

    if (width === -1) {
      width = fields.length;
      if (header) columns = fields;
      else rows.push(fields);
    } else {
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recStartLine, row: recRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        const extra = fields.slice(width);
        errors.push({ code: 'long_row', line: recStartLine, row: recRow, extra });
        fields.length = width;
      }
      rows.push(fields);
    }
    recCount++;
    if (endKind === 3) break; // EOF
  }

  return { columns, rows, errors };
}
