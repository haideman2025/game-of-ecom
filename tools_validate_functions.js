const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const root = process.argv[2] || 'fb-pack-studio-deploy/functions';
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(root).sort();
const failures = [];
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  try {
    parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'importMeta',
        'topLevelAwait',
        'classProperties',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport'
      ],
      errorRecovery: false
    });
  } catch (e) {
    failures.push({ file, line: e.loc?.line || null, column: e.loc?.column || null, message: e.message });
  }
}
const result = { root, files: files.length, failures };
console.log(JSON.stringify(result, null, 2));
process.exit(failures.length ? 1 : 0);
