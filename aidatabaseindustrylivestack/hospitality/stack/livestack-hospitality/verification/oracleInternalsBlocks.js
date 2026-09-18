const fs = require('fs');
const path = require('path');

const PAGE_DIRECTORY = path.resolve(__dirname, '../frontend/src/pages');
const SQL_BLOCK_PATTERN = /<SqlBlock\s+code=\{`([\s\S]*?)`\}\s*\/>/g;

function collectOracleInternalsBlocks() {
  const blocks = [];
  const pageFiles = fs.readdirSync(PAGE_DIRECTORY)
    .filter((name) => name.endsWith('.jsx'))
    .sort();

  for (const file of pageFiles) {
    const source = fs.readFileSync(path.join(PAGE_DIRECTORY, file), 'utf8');
    let match;
    let index = 0;
    while ((match = SQL_BLOCK_PATTERN.exec(source))) {
      index += 1;
      blocks.push({ file, index, code: match[1] });
    }
  }

  return blocks;
}

module.exports = { collectOracleInternalsBlocks };
