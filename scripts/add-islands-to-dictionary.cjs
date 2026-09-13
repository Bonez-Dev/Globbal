/**
 * Adds large islands (>= 400 sq mi) to LOCKED_WORDS and place-metadata.json.
 *
 * Run: node scripts/add-islands-to-dictionary.cjs
 * Requires: data/world-islands-large.json (npm run build:large-islands)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const ISLANDS_PATH = path.join(ROOT, "data", "world-islands-large.json");
const { compactWord, displayWord } = require(path.join(ROOT, "dictionary-keys.js"));

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function loadIslandRows() {
  if (!fs.existsSync(ISLANDS_PATH)) {
    throw new Error(`Missing ${ISLANDS_PATH}. Run: npm run build:large-islands`);
  }
  const payload = JSON.parse(fs.readFileSync(ISLANDS_PATH, "utf8"));
  const rawRows = Array.isArray(payload.islands) ? payload.islands : payload;
  const islandRows = [];
  const seenCompacts = new Set();

  rawRows.forEach((row) => {
    const display = displayWord(row.name);
    const compact = compactWord(display);
    if (!display || !compact) {
      throw new Error(`Invalid island name: ${row.name}`);
    }
    if (seenCompacts.has(compact)) {
      return;
    }
    seenCompacts.add(compact);
    islandRows.push({
      name: row.name,
      display,
      compact,
      region: row.region || "—",
      areaKm2: Number(row.areaKm2)
    });
  });

  return islandRows;
}

const islandRows = loadIslandRows();
const islandCompacts = new Set(islandRows.map((row) => row.compact));
const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

const keptWords = words.filter((word) => !islandCompacts.has(compactWord(word)));
const islandWords = islandRows.map((row) => row.display);
const mergedWords = [...keptWords, ...islandWords]
  .filter((word, index, list) => list.indexOf(word) === index)
  .sort((a, b) => a.localeCompare(b));

islandRows.forEach((island) => {
  const existingWord = words.find((w) => compactWord(w) === island.compact);
  const existingMeta = existingWord ? meta[existingWord] : null;

  if (existingMeta?.kind === "country" || existingMeta?.kind === "state") {
    const key = existingWord || island.display;
    meta[key] = {
      ...existingMeta,
      island: {
        name: island.name,
        region: island.region,
        areaKm2: island.areaKm2
      }
    };
    return;
  }

  meta[island.display] = {
    region: island.region,
    areaKm2: island.areaKm2,
    kind: "island"
  };

  if (existingWord && existingWord !== island.display) {
    delete meta[existingWord];
  }

  words.forEach((word) => {
    if (compactWord(word) === island.compact && word !== island.display && meta[word]) {
      delete meta[word];
    }
  });
});

const added = islandWords.filter(
  (display) => !words.some((word) => compactWord(word) === compactWord(display))
).length;

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

process.stdout.write(
  `Islands: ${islandRows.length} in dictionary (${added} new words).\n` +
    `Dictionary total: ${mergedWords.length} words.\n` +
    `place-metadata.json: ${Object.keys(meta).length} entries.\n`
);
