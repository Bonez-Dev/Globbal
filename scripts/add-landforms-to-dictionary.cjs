/**
 * Adds plains, valleys, and continents to the dictionary.
 * Large islands (>= 400 sq mi) are handled by scripts/add-islands-to-dictionary.cjs.
 *
 * Sources:
 *  - data/world-continents.json
 *  - GeoNames allCountries.txt (feature class T; CC-BY-4.0)
 *
 * Run: node scripts/add-landforms-to-dictionary.cjs
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const CONTINENTS_PATH = path.join(ROOT, "data", "world-continents.json");
const CACHE = path.join(ROOT, "geonames-cache");
const ALL_COUNTRIES_TXT = path.join(CACHE, "allCountries.txt");
const COUNTRY_INFO_PATH = path.join(CACHE, "countryInfo.txt");
const { compactWord, displayWord, isPlayableDictionaryWord } = require(path.join(ROOT, "dictionary-keys.js"));
const { normalizeCountry } = require("./city-country-resolver.cjs");

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function loadCountryNames() {
  const map = {};
  if (!fs.existsSync(COUNTRY_INFO_PATH)) {
    return map;
  }
  fs.readFileSync(COUNTRY_INFO_PATH, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line || line.startsWith("#")) {
        return;
      }
      const cols = line.split("\t");
      if (cols[0] && cols[4]) {
        map[cols[0]] = normalizeCountry(cols[4]);
      }
    });
  return map;
}

function loadCountryKeys() {
  const keys = new Set();
  if (!fs.existsSync(COUNTRY_INFO_PATH)) {
    return keys;
  }
  fs.readFileSync(COUNTRY_INFO_PATH, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line || line.startsWith("#")) {
        return;
      }
      const cols = line.split("\t");
      if (cols[4]) {
        keys.add(compactWord(cols[4]));
      }
      if (cols[1] && cols[1].length === 3) {
        keys.add(compactWord(cols[1]));
      }
    });
  return keys;
}

function isPlainName(name, featureCode) {
  const upper = displayWord(name);
  return featureCode === "PLN" || /\bPLAIN(S)?\b/.test(upper);
}

function isValleyName(name) {
  const upper = displayWord(name);
  return /\bVALLEY(S)?\b/.test(upper) || /\bVALLE\b/.test(upper);
}

function isProtectedEntry(meta) {
  if (!meta) {
    return false;
  }
  return (
    meta.kind === "country" ||
    meta.kind === "state" ||
    meta.kind === "county" ||
    meta.kind === "shire" ||
    meta.kind === "river" ||
    meta.kind === "mountain" ||
    meta.kind === "mountainRange" ||
    meta.kind === "hill" ||
    meta.kind === "island" ||
    ["ocean", "sea", "bay", "gulf", "bight"].includes(meta.kind)
  );
}

function isCityEntry(meta) {
  if (!meta || !meta.country || isProtectedEntry(meta)) {
    return false;
  }
  if (["plain", "valley", "island", "continent"].includes(meta.kind)) {
    return false;
  }
  return meta.population != null && Number(meta.population) > 0;
}

function upsertCandidate(map, candidate) {
  if (!isPlayableDictionaryWord(candidate.word)) {
    return;
  }
  const key = compactWord(candidate.word);
  if (!key || key.length < 2) {
    return;
  }
  const prev = map.get(key);
  if (!prev) {
    map.set(key, candidate);
    return;
  }
  const prevArea = prev.areaKm2 || 0;
  const nextArea = candidate.areaKm2 || 0;
  if (nextArea > prevArea) {
    map.set(key, candidate);
  }
}

function loadCuratedRows() {
  return JSON.parse(fs.readFileSync(CONTINENTS_PATH, "utf8")).map((row) => ({
    word: displayWord(row.name),
    kind: "continent",
    region: row.region || "—",
    country: "—",
    areaKm2: row.areaKm2 != null ? Number(row.areaKm2) : null
  }));
}

async function ingestGeonameLandforms(countryNames, countryKeys) {
  /** @type {Map<string, { word: string, kind: string, country: string, region: string, areaKm2: number|null, featureCode: string }>} */
  const candidates = new Map();
  let scanned = 0;
  let matched = 0;

  if (!fs.existsSync(ALL_COUNTRIES_TXT)) {
    throw new Error("Missing geonames-cache/allCountries.txt (run add-mountains once to download).");
  }

  const stream = fs.createReadStream(ALL_COUNTRIES_TXT, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) {
      continue;
    }
    scanned += 1;
    if (scanned % 500000 === 0) {
      process.stdout.write(`\rGeoNames rows scanned: ${scanned.toLocaleString()}   `);
    }
    const cols = line.split("\t");
    if (cols[6] !== "T") {
      continue;
    }
    const featureCode = cols[7] || "";
    const name = cols[1];
    let kind = null;
    if (isPlainName(name, featureCode)) {
      kind = "plain";
    } else if (isValleyName(name)) {
      kind = "valley";
    }
    if (!kind) {
      continue;
    }

    const word = displayWord(name);
    const key = compactWord(word);
    if (!word || key.length < 2 || countryKeys.has(key)) {
      continue;
    }
    matched += 1;
    const country = normalizeCountry(countryNames[cols[8]] || cols[8] || "—");
    upsertCandidate(candidates, {
      word,
      kind,
      country,
      region: country,
      areaKm2: null,
      featureCode
    });
  }

  process.stdout.write(`\rGeoNames rows scanned: ${scanned.toLocaleString()}   \n`);
  process.stdout.write(`GeoNames landform matches: ${matched.toLocaleString()}, unique: ${candidates.size.toLocaleString()}.\n`);
  return candidates;
}

async function main() {
  const countryNames = loadCountryNames();
  const countryKeys = loadCountryKeys();
  const words = loadLockedWords();
  const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  const wordSet = new Set(words);
  const compactToWord = new Map(words.map((word) => [compactWord(word), word]));

  const curated = loadCuratedRows();
  const geonameCandidates = await ingestGeonameLandforms(countryNames, countryKeys);

  curated.forEach((candidate) => {
    upsertCandidate(geonameCandidates, candidate);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const kindCounts = { plain: 0, valley: 0, continent: 0 };

  geonameCandidates.forEach((candidate) => {
    kindCounts[candidate.kind] = (kindCounts[candidate.kind] || 0) + 1;
    const key = compactWord(candidate.word);
    const existingWord = compactToWord.get(key);
    const existingMeta = existingWord ? meta[existingWord] : null;

    if (isProtectedEntry(existingMeta) || isCityEntry(existingMeta)) {
      skipped += 1;
      return;
    }

    if (!wordSet.has(candidate.word)) {
      wordSet.add(candidate.word);
      compactToWord.set(key, candidate.word);
      added += 1;
    }

    const areaSqMi =
      candidate.areaKm2 != null ? Math.round((candidate.areaKm2 / 2.58999) * 10) / 10 : null;

    meta[candidate.word] = {
      kind: candidate.kind,
      country: candidate.country,
      region: candidate.region,
      areaKm2: candidate.areaKm2,
      areaSqMi,
      featureCode: candidate.featureCode || candidate.kind.toUpperCase()
    };
    updated += 1;

    if (existingWord && existingWord !== candidate.word && meta[existingWord]) {
      delete meta[existingWord];
    }
  });

  const mergedWords = Array.from(wordSet).sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
  fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

  process.stdout.write(
    `Landforms: ${geonameCandidates.size} unique entries (${added} new words, ${updated} metadata, ${skipped} skipped).\n` +
      `  plain: ${kindCounts.plain || 0}\n` +
      `  valley: ${kindCounts.valley || 0}\n` +
      `  continent: ${kindCounts.continent || 0}\n` +
      `Dictionary total: ${mergedWords.length} words.\n`
  );
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
