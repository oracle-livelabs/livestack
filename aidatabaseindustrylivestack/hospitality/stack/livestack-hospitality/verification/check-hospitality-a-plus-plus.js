#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAX_EXAMPLES = 8;

const targetRoots = [
  'frontend/src',
  'backend',
  'db/data',
  'db/schema',
  'verification',
  'package.json',
  'compose.yml',
  'Containerfile',
];

const allowedExtensions = new Set([
  '.css',
  '.csv',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

const ignoredPathFragments = [
  `${path.sep}frontend${path.sep}node_modules${path.sep}`,
  `${path.sep}frontend${path.sep}dist${path.sep}`,
  `${path.sep}db${path.sep}data${path.sep}onnx${path.sep}`,
  `${path.sep}verification${path.sep}check-hospitality-a-plus-plus.js`,
];

const ignoredBasenames = new Set(['package-lock.json']);

const bannedPatterns = [
  {
    name: 'Legacy Aurora brand naming',
    pattern: /\bAurora(?: Hospitality Group)?\b|aurora-|aurorahospitality/i,
  },
  {
    name: 'Legacy Seer demo brand naming',
    pattern: /\bSeer(?: Hospitality Group| Hotels)?\b|seer-|seer_hospitality|seerhospitality/i,
  },
  {
    name: 'Legacy finance property or sample brand names',
    pattern:
      /\b(?:Meridian Trust|meridiantrust|Retail Hospitality|Clearwater Revenue Union|clearwatercu|NorthBridge Resorts|northbridgeinvest|Harvest Commercial Hotel|harvestcontracted|VoltPay Hospitality|voltpay|Civic National Hotel|civicnational|PrimeCard|primecard|Portside Event Revenue|portsidetrade|Propel Pension Strategies|propelpension|SECUpdates|secupdates|LedgerGrade Connect|ledgergradeconnect|SpecHospitality Exchange|spechospitalityexchange|ApexOne Demand|apexonedemand|AltYield Alternative Revenue|altyieldrevenue)\b/i,
  },
  {
    name: 'Banking regulatory, credit, mortgage, or advisor signal language',
    pattern:
      /\b(?:Liquidity Risk|Federal Reserve|FDIC|FINRA|KYC|AML|credit_pulse|aml_watch|capital_rules|portfolio_watch|mortgage_pipeline|mortgage_signal|loan_servicing|advisor_review_queue|occ_harborstone-operations-analytics|kyc_queue|fdic_bulletin|underwriting|basel|cecl|banking|wealth|advisor)\b/i,
  },
  {
    name: 'Finance product or workflow names',
    pattern:
      /\b(?:Corporate Card Program|Rewards Revenue Card|Public Sector Bond Ladder|Green Bond|Rate Hedge|Options Trading Enablement|Commercial Real Estate Group Booking|Commercial Real Estate|Student Rehospitality|Trust Administration|Risk Tolerance|risk-tolerance|529 Family Package Plan|Public Hospitality|Delinquency Outreach|Merchant Acquiring|Chargeback|Customer Suitability|Customer Profitability|Robo Customer Experiencey|Customer Experiencey|Propertyal Folio Fund|Event Revenue Letter of Revenue|Commercial Lending|Consumer Lending|Cards and Payments|Revenue Card|Commercial Card|Merchant Services|Fixed Income|Foreign Exchange|Interest Rate Risk|Annuity|ETF|Tax Optimization|Securities Lending|Pension Liability|Mortgage|CleanRate Lending|Customer Experience Book Review|Customer Revenue Impact Engine|purityaml|customer experience_signal)\b|finra_watch|card-dispute/i,
  },
  {
    name: 'Malformed hospitality replacement artifacts',
    pattern:
      /\b(?:Rehospitality|Customer Experiencey|Demand demands|Propertyal|propertys|booking booking|Guest Guest|Property Portfolio risk model|Massbanquet|Ebanquet|cbanquet|forEbanquet|usvip|Arebanquet|stainstant|Bebanquet|rebanquet|Outrebanquet|UNREbanquet|Transfer Transfer|Brand StandardsOND|productEvent Options|customerEvent Options|profileEvent Options|pathEvent Options|executeEvent Options|Operations RiskSeverity)\b/i,
  },
  {
    name: 'Malformed mixed-case guest result aliases',
    pattern: /\b(?:guest_NAME|guest_ID|guest_TIER|TOTAL_guestS|UNIQUE_guestS)\b/,
  },
  {
    name: 'Visible finance copy that should be hospitality-native',
    pattern:
      /\b(?:client suitability|customer suitability|settlement queue|spread movement|rate guidance changed|customer notes require update|API order volume|elevated order volume|order volume for|relationship teams should monitor)\b/i,
  },
];

const requiredTerms = [
  {
    name: 'Hospitality LiveStack brand',
    pattern: /\bHospitality LiveStack\b/,
  },
  {
    name: 'Oracle logo lockup',
    pattern: /oracle-logo\.svg/,
  },
  {
    name: 'Guest Rewards',
    pattern: /\bGuest Rewards\b|\bGuest Rewards\b/,
  },
  {
    name: 'Property brand tier',
    pattern: /\bbrand tier\b/i,
  },
  {
    name: 'Owner value',
    pattern: /\bowner value\b/i,
  },
  {
    name: 'Group block',
    pattern: /\bgroup block\b/i,
  },
  {
    name: 'Fictional property portfolio',
    pattern: /\b(?:Canyon Reserve|Summit Grand|Lakeside|Grand Garden|Airport Hotel|Extended Stay)\b/,
  },
  {
    name: 'Occupancy',
    pattern: /\boccupancy\b/i,
  },
  {
    name: 'Average daily rate',
    pattern: /\b(?:ADR|average daily rate)\b/i,
  },
  {
    name: 'RevPAR',
    pattern: /\bRevPAR\b/i,
  },
  {
    name: 'Room revenue',
    pattern: /\broom revenue\b/i,
  },
  {
    name: 'Food and beverage revenue',
    pattern: /\b(?:food and beverage revenue|F&B revenue)\b/i,
  },
  {
    name: 'Event revenue',
    pattern: /\bevent revenue\b/i,
  },
  {
    name: 'Guest satisfaction',
    pattern: /\bguest satisfaction\b/i,
  },
  {
    name: 'Net promoter score',
    pattern: /\b(?:NPS|net promoter)\b/i,
  },
  {
    name: 'Booking pace',
    pattern: /\bbooking pace\b/i,
  },
  {
    name: 'Cancellation rate',
    pattern: /\bcancellation rate\b/i,
  },
  {
    name: 'No-show rate',
    pattern: /\bno-show rate\b/i,
  },
  {
    name: 'Average length of stay',
    pattern: /\b(?:average length of stay|length of stay)\b/i,
  },
  {
    name: 'Housekeeping',
    pattern: /\bhousekeeping\b/i,
  },
  {
    name: 'Maintenance response',
    pattern: /\bmaintenance response\b/i,
  },
  {
    name: 'Labor cost',
    pattern: /\blabor cost\b/i,
  },
  {
    name: 'Cost per occupied room',
    pattern: /\bcost per occupied room\b/i,
  },
  {
    name: 'Multi-property reporting',
    pattern: /\bmulti-property\b/i,
  },
  {
    name: 'Owner financial validation',
    pattern: /\bOwner Financial Validation Workbench\b/,
  },
  {
    name: 'Owner attestation',
    pattern: /\bowner attestation\b/i,
  },
  {
    name: 'Close readiness',
    pattern: /\bclose readiness\b/i,
  },
];

function shouldSkip(filePath) {
  const absolute = path.resolve(filePath);
  return (
    ignoredBasenames.has(path.basename(absolute)) ||
    ignoredPathFragments.some((fragment) => absolute.includes(fragment)) ||
    !allowedExtensions.has(path.extname(absolute))
  );
}

function walk(entryPath, files) {
  if (!fs.existsSync(entryPath)) return;

  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(entryPath)) {
      walk(path.join(entryPath, child), files);
    }
    return;
  }

  if (!shouldSkip(entryPath)) {
    files.push(entryPath);
  }
}

function loadFiles() {
  const files = [];
  for (const target of targetRoots) {
    walk(path.join(ROOT, target), files);
  }
  return [...new Set(files)].sort();
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function scanBanned(files) {
  const failures = [];

  for (const rule of bannedPatterns) {
    const examples = [];
    let count = 0;

    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (rule.pattern.test(lines[index])) {
          count += 1;
          if (examples.length < MAX_EXAMPLES) {
            examples.push(`${rel(file)}:${index + 1}: ${lines[index].trim().slice(0, 220)}`);
          }
        }
      }
    }

    if (count > 0) {
      failures.push({ type: 'banned', name: rule.name, count, examples });
    }
  }

  return failures;
}

function scanRequired(files) {
  const corpus = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  return requiredTerms
    .filter((rule) => !rule.pattern.test(corpus))
    .map((rule) => ({ type: 'missing', name: rule.name, count: 0, examples: [] }));
}

function main() {
  const files = loadFiles();
  const failures = [...scanBanned(files), ...scanRequired(files)];

  if (failures.length > 0) {
    console.error('Hospitality A++ verification failed.');
    for (const failure of failures) {
      if (failure.type === 'banned') {
        console.error(`\n- ${failure.name}: ${failure.count} match(es)`);
        for (const example of failure.examples) {
          console.error(`  ${example}`);
        }
      } else {
        console.error(`\n- Missing required hospitality concept: ${failure.name}`);
      }
    }
    process.exit(1);
  }

  console.log(`Hospitality A++ verification passed across ${files.length} source, data, and verification files.`);
}

main();
