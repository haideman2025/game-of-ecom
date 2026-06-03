const fs = require('fs');
const parser = require('@babel/parser');

const htmlPath = process.argv[2] || 'fb-pack-studio.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
let index = 0;
let failures = [];
let parsed = [];

while ((match = scriptRegex.exec(html))) {
  index += 1;
  const attrs = match[1] || '';
  const code = match[2] || '';
  const startOffset = match.index;
  const startLine = html.slice(0, startOffset).split(/\r?\n/).length;
  const src = /\bsrc\s*=/.test(attrs);
  const importmap = /type\s*=\s*["']importmap["']/.test(attrs);
  if (src || importmap || !code.trim()) {
    parsed.push({ index, attrs: attrs.trim(), skipped: true, reason: src ? 'external src' : importmap ? 'importmap json' : 'empty', startLine });
    continue;
  }
  try {
    parser.parse(code, {
      sourceType: /data-type\s*=\s*["']module["']/.test(attrs) ? 'module' : 'script',
      plugins: [
        'jsx',
        'classProperties',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport',
        'asyncGenerators',
        'topLevelAwait'
      ],
      errorRecovery: false
    });
    parsed.push({ index, attrs: attrs.trim(), skipped: false, ok: true, startLine, lines: code.split(/\r?\n/).length });
  } catch (error) {
    const relativeLine = error.loc && error.loc.line ? error.loc.line : 0;
    failures.push({
      index,
      attrs: attrs.trim(),
      startLine,
      relativeLine,
      absoluteLine: relativeLine ? startLine + relativeLine : startLine,
      message: error.message
    });
  }
}

console.log(JSON.stringify({ htmlPath, scriptBlocks: index, parsed, failures }, null, 2));
if (failures.length) process.exit(1);
