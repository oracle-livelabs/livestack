import http from 'node:http';
import { faker } from '@faker-js/faker';
import kafkajs from 'kafkajs';

const { Kafka } = kafkajs;

const PORT = Number(process.env.PORT || 18088);
const KAFKA_BROKERS = String(process.env.KAFKA_BROKERS || 'localhost:19092')
  .split(',')
  .map((broker) => broker.trim())
  .filter(Boolean);
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'peakgear.demand.signals.raw';
const DEFAULT_RATE_MS = Number(process.env.SIGNAL_RATE_MS || 1500);
const RECENT_EVENT_LIMIT = Number(process.env.RECENT_EVENT_LIMIT || 25);

const PRODUCTS = [
  ['SKU-100007', 'Canyonridge Trail Runner 7', ['trail-running', 'footwear']],
  ['SKU-100029', 'Trailforge Trail Runner 29', ['trail-running', 'race-weekend']],
  ['SKU-100041', 'Velocityworks Dry Bag 41', ['water-sports', 'weather']],
  ['SKU-100047', 'Peakgear Paddle Leash 47', ['water-sports', 'pickup']],
  ['SKU-100015', 'Summitpulse Outdoor Jacket 15', ['outdoor', 'replenishment']],
  ['SKU-100072', 'Peakgear Headlamp 72', ['outdoor', 'store-ops']],
  ['SKU-100011', 'Ironkinetic Kettlebell 11', ['strength-training', 'price-match']],
  ['SKU-100080', 'Velocityworks Adjustable Dumbbells 80', ['strength-training', 'marketplace']],
  ['SKU-100033', 'Aerostride Training Hoodie 33', ['activewear', 'creator-demand']],
  ['SKU-100003', 'Velocityworks Training Hoodie 3', ['activewear', 'returns-audit']],
  ['SKU-100096', 'Aerostride Cycling Computer 96', ['cycling', 'search']],
  ['SKU-100004', 'Hydrawave Bike Light Set 4', ['cycling', 'event-demand']],
  ['SKU-100025', 'Summitpulse Basketball 25', ['team-sports', 'b2b']],
  ['SKU-100097', 'Peakgear Soccer Ball 97', ['team-sports', 'summer-camps']],
];

const SOURCE_PROFILES = [
  {
    sourceSystem: 'social_listening',
    sourceType: 'creator',
    platforms: ['tiktok', 'instagram', 'youtube', 'threads'],
    templates: [
      '{city} training creator says {productA} is showing up in race prep kits before the weekend.',
      '{city} trail club members are asking where to find {productA} and {productB} before the next event.',
      'Creator demand is rising for {productA} after new workout videos crossed regional feeds in {region}.',
    ],
  },
  {
    sourceSystem: 'weather_demand_feed',
    sourceType: 'weather',
    platforms: ['weather_api'],
    templates: [
      '{region} weather alerts lifted demand for {productA} and {productB}.',
      '{city} forecast changes are pulling shoppers toward {productA} for same-day pickup.',
      'Warm weekend conditions extended outdoor demand for {productA} across {region}.',
    ],
  },
  {
    sourceSystem: 'store_ops_bulletin',
    sourceType: 'store_ops',
    platforms: ['slack'],
    templates: [
      '{city} associates report low display stock for {productA} and ask for replenishment.',
      'Store teams in {region} flagged pickup pressure around {productA} and {productB}.',
      '{city} store operations asked whether {productA} can substitute for low {productB} supply.',
    ],
  },
  {
    sourceSystem: 'marketplace_monitor',
    sourceType: 'pricing',
    platforms: ['marketplace'],
    templates: [
      'Competitive bundle pricing moved for {productA} in {city} pickup zones.',
      '{region} marketplace prices tightened for {productA} and {productB}.',
      'Price-match pressure increased around {productA} after competitor promotions in {city}.',
    ],
  },
  {
    sourceSystem: 'site_search',
    sourceType: 'search',
    platforms: ['site_search'],
    templates: [
      '{city} search sessions show rising intent for {productA}.',
      'Search volume for {productA} increased after a local event announcement in {region}.',
      '{region} shoppers are comparing {productA} with {productB} in site search.',
    ],
  },
];

const REGIONS = [
  ['CA', 'San Jose'],
  ['WA', 'Seattle'],
  ['CO', 'Denver'],
  ['FL', 'Tampa'],
  ['TX', 'Austin'],
  ['NY', 'New York'],
  ['IL', 'Chicago'],
  ['MA', 'Boston'],
  ['AZ', 'Phoenix'],
  ['OR', 'Portland'],
];

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'peakgear-signal-generator',
  brokers: KAFKA_BROKERS,
  connectionTimeout: 5000,
  requestTimeout: 15000,
  retry: {
    retries: 6,
    initialRetryTime: 300,
  },
});

const admin = kafka.admin();
const producer = kafka.producer();

const state = {
  adminConnected: false,
  producerConnected: false,
  running: false,
  rateMs: DEFAULT_RATE_MS,
  timer: null,
  eventsProduced: 0,
  startedAt: null,
  stoppedAt: null,
  lastEvent: null,
  recentEvents: [],
  lastError: null,
};

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function compactState() {
  return {
    ok: true,
    running: state.running,
    topic: KAFKA_TOPIC,
    brokers: KAFKA_BROKERS,
    rateMs: state.rateMs,
    eventsProduced: state.eventsProduced,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt,
    lastEvent: state.lastEvent,
    recentEvents: state.recentEvents,
    lastError: state.lastError,
  };
}

async function ensureAdmin() {
  if (!state.adminConnected) {
    await admin.connect();
    state.adminConnected = true;
  }
}

async function ensureProducer() {
  if (!state.producerConnected) {
    await producer.connect();
    state.producerConnected = true;
  }
}

async function ensureTopic() {
  await ensureAdmin();
  const topics = await admin.listTopics();
  if (!topics.includes(KAFKA_TOPIC)) {
    await admin.createTopics({
      waitForLeaders: true,
      topics: [{
        topic: KAFKA_TOPIC,
        numPartitions: Number(process.env.KAFKA_TOPIC_PARTITIONS || 1),
        replicationFactor: Number(process.env.KAFKA_TOPIC_REPLICATION_FACTOR || 1),
      }],
    });
  }
}

function pickDifferentProduct(productA) {
  const candidates = PRODUCTS.filter(([sku]) => sku !== productA[0]);
  return faker.helpers.arrayElement(candidates);
}

function buildSignalText(template, values) {
  return template
    .replaceAll('{city}', values.city)
    .replaceAll('{region}', values.region)
    .replaceAll('{productA}', values.productA)
    .replaceAll('{productB}', values.productB);
}

function buildEvent() {
  const profile = faker.helpers.arrayElement(SOURCE_PROFILES);
  const [region, city] = faker.helpers.arrayElement(REGIONS);
  const productA = faker.helpers.arrayElement(PRODUCTS);
  const productB = pickDifferentProduct(productA);
  const [skuA, nameA, tagsA] = productA;
  const [skuB, nameB, tagsB] = productB;
  const criticality = faker.number.float({ min: 34, max: 96, fractionDigits: 1 });
  const likes = profile.sourceType === 'creator'
    ? faker.number.int({ min: 850, max: 68000 })
    : faker.number.int({ min: 0, max: 120 });
  const views = profile.sourceType === 'creator'
    ? faker.number.int({ min: 48000, max: 1800000 })
    : faker.number.int({ min: 400, max: 140000 });
  const shares = Math.round(likes * faker.number.float({ min: 0.05, max: 0.22 }));
  const comments = Math.round(likes * faker.number.float({ min: 0.01, max: 0.08 }));
  const momentumFlag = criticality >= 88 || likes > 50000
    ? 'mega_viral'
    : criticality >= 72 || likes > 10000
      ? 'viral'
      : criticality >= 55 || likes > 1000
        ? 'rising'
        : 'normal';
  const signalId = `LIVE-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${String(state.eventsProduced + 1).padStart(6, '0')}`;
  const topicTags = Array.from(new Set([
    ...tagsA,
    ...tagsB,
    profile.sourceType,
    region.toLowerCase(),
  ])).slice(0, 6);

  return {
    signal_id: signalId,
    observed_at: new Date().toISOString(),
    source_system: profile.sourceSystem,
    source_type: profile.sourceType,
    platform: faker.helpers.arrayElement(profile.platforms),
    region,
    signal_text: buildSignalText(faker.helpers.arrayElement(profile.templates), {
      city,
      region,
      productA: nameA,
      productB: nameB,
    }),
    likes,
    shares,
    comments,
    views,
    sentiment_score: faker.number.float({ min: -0.35, max: 0.82, fractionDigits: 3 }),
    criticality_score: criticality,
    momentum_flag: momentumFlag,
    product_hints: JSON.stringify([skuA, skuB, nameA, nameB]),
    topic_tags: JSON.stringify(topicTags),
  };
}

async function produceOne() {
  await ensureProducer();
  const event = buildEvent();
  await producer.send({
    topic: KAFKA_TOPIC,
    messages: [{
      key: event.signal_id,
      value: JSON.stringify(event),
      headers: {
        source: 'peakgear-live-demo',
        source_system: event.source_system,
      },
    }],
  });

  state.eventsProduced += 1;
  state.lastEvent = event;
  state.recentEvents = [event, ...state.recentEvents].slice(0, RECENT_EVENT_LIMIT);
  state.lastError = null;
  return event;
}

async function produceLoop() {
  try {
    await produceOne();
  } catch (err) {
    state.lastError = err.message || String(err);
  }
}

async function startStream(rateMs) {
  await ensureTopic();
  await ensureProducer();
  state.rateMs = Math.max(250, Number(rateMs || state.rateMs || DEFAULT_RATE_MS));

  if (state.timer) {
    clearInterval(state.timer);
  }

  state.running = true;
  state.startedAt = new Date().toISOString();
  state.stoppedAt = null;
  await produceLoop();
  state.timer = setInterval(produceLoop, state.rateMs);
}

async function stopStream() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.running = false;
  state.stoppedAt = new Date().toISOString();
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      jsonResponse(res, 200, { ok: true, service: 'peakgear-signal-generator' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      jsonResponse(res, 200, compactState());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/topic') {
      await ensureTopic();
      jsonResponse(res, 200, { ok: true, topic: KAFKA_TOPIC, brokers: KAFKA_BROKERS });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/start') {
      const body = await readJsonBody(req);
      await startStream(body.rateMs);
      jsonResponse(res, 200, compactState());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/stop') {
      await stopStream();
      jsonResponse(res, 200, compactState());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/produce-once') {
      await ensureTopic();
      const event = await produceOne();
      jsonResponse(res, 200, { ok: true, event, status: compactState() });
      return;
    }

    jsonResponse(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    state.lastError = err.message || String(err);
    jsonResponse(res, 500, { ok: false, error: state.lastError });
  }
}

const server = http.createServer(handleRequest);

process.on('SIGTERM', async () => {
  await stopStream();
  try { if (state.producerConnected) await producer.disconnect(); } catch {}
  try { if (state.adminConnected) await admin.disconnect(); } catch {}
  server.close(() => process.exit(0));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PeakGear signal generator listening on ${PORT}`);
  console.log(`Kafka topic: ${KAFKA_TOPIC}`);
  console.log(`Kafka brokers: ${KAFKA_BROKERS.join(', ')}`);
});
