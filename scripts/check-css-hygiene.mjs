#!/usr/bin/env node
// Guards against CSS rules that silently hijack Tailwind utility classes.
//
// Background: in April 2026 we lost 3+ days to a bug where globals.css
// had `.flex { flex: 1; }` inside `@supports (-webkit-touch-callout: none)`.
// That forced `flex-grow: 1` onto every element with Tailwind's `.flex`
// class on iOS only — silently breaking every flex layout on iPhone.
// Desktop was fine, so the bug was invisible to normal debugging.
//
// This check fails the commit if any custom CSS selector matches a
// Tailwind utility class name that we own (display, flex children,
// grid, visibility, sizing). Those classes belong to Tailwind — never
// add rules to them in globals.css.

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { argv, exit } from 'node:process';

// Tailwind utility class names that must NEVER appear as a CSS selector
// in our own stylesheets. If you need to add behavior to elements using
// these utilities, use a unique custom class instead (e.g. `.my-thing`).
const FORBIDDEN_SELECTORS = [
  'flex', 'inline-flex', 'grid', 'inline-grid',
  'block', 'inline-block', 'inline', 'hidden',
  'fixed', 'absolute', 'relative', 'sticky',
  'transform', 'transition',
  'container',
];

const files = argv.slice(2).length > 0
  ? argv.slice(2)
  : ['src/app/globals.css'];

let hits = 0;

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    // Match selectors starting with `.flex` / `.grid` / etc. — allow
    // compound selectors like `.flex-row` or `.flex-\[...\]` (those are
    // different Tailwind utilities, not overrides).
    for (const cls of FORBIDDEN_SELECTORS) {
      // Look for `.cls {` or `.cls,` or `.cls ` as a standalone selector
      const re = new RegExp(`(^|[\\s,>+~])\\.${cls}(\\s*[,{]|\\s+\\S)`, '');
      if (re.test(trimmed) && !trimmed.startsWith('/*') && !trimmed.startsWith('//')) {
        console.error(
          `\x1b[31m✗ ${file}:${idx + 1}\x1b[0m  Overriding Tailwind utility \`.${cls}\`:`
        );
        console.error(`  ${trimmed}`);
        console.error(
          `  \x1b[33mFix:\x1b[0m Use a unique custom class name instead. ` +
          `See scripts/check-css-hygiene.mjs for why.`
        );
        hits++;
      }
    }
  });
}

if (hits > 0) {
  console.error(`\n\x1b[31m${hits} CSS hygiene violation${hits === 1 ? '' : 's'}.\x1b[0m`);
  console.error(
    `These rules hijack Tailwind utility classes and silently break layouts — ` +
    `especially inside \`@supports\` blocks where they only fire on certain browsers.`
  );
  exit(1);
}
