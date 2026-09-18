const { collectOracleInternalsBlocks } = require('./oracleInternalsBlocks');

process.stdout.write(`WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
SET FEEDBACK OFF
SET PAGESIZE 5
`);

for (const block of collectOracleInternalsBlocks()) {
  process.stdout.write(`PROMPT [${block.file} #${block.index}]\n`);
  process.stdout.write(`${block.code}\n`);
}

process.stdout.write('PROMPT ORACLE_INTERNALS_COPY_PASTE_PASS\nEXIT\n');
