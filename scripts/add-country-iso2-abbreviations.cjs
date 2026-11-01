/**
 * Adds ISO 3166-1 alpha-2 country codes to LOCKED_WORDS and place-metadata.json
 * (Abbreviations dictionary folder). Skips codes that already mean a US state (CA, TX, …).
 *
 * Run: node scripts/add-country-iso2-abbreviations.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const STATES_PATH = path.join(ROOT, "data", "us-states.json");
const { displayWord } = require(path.join(ROOT, "dictionary-keys.js"));

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function copyWikiFields(fromMeta) {
  const out = {};
  if (fromMeta.wikipediaUrl) {
    out.wikipediaUrl = fromMeta.wikipediaUrl;
  }
  if (Array.isArray(fromMeta.wikipediaCandidates) && fromMeta.wikipediaCandidates.length) {
    out.wikipediaCandidates = fromMeta.wikipediaCandidates.map((c) => ({ ...c }));
  }
  return out;
}

function applyCountryIso2Abbreviations(words, meta, options = {}) {
  const stateCodes = new Set(
    JSON.parse(fs.readFileSync(options.statesPath || STATES_PATH, "utf8")).map((state) =>
      String(state.code || "").toUpperCase()
    )
  );

  const mergedWords = [...words];
  let added = 0;
  let skippedStateClash = 0;

  const countryDisplays = Object.keys(meta).filter(
    (key) => meta[key]?.kind === "country" && !meta[key]?.countryAlias
  );

  countryDisplays.forEach((countryDisplay) => {
    const countryMeta = meta[countryDisplay];
    const iso = String(countryMeta.iso || "").toUpperCase();
    if (!iso || iso.length !== 2) {
      return;
    }

    if (stateCodes.has(iso)) {
      skippedStateClash += 1;
      return;
    }

    const existing = meta[iso];
    if (existing?.stateCode || (existing?.kind === "abbreviation" && existing?.stateCode)) {
      skippedStateClash += 1;
      return;
    }

    meta[iso] = {
      kind: "abbreviation",
      abbreviationFor: countryDisplay,
      countryIso2: true,
      country: countryMeta.country,
      population: countryMeta.population,
      iso: countryMeta.iso,
      iso3: countryMeta.iso3,
      ...copyWikiFields(countryMeta)
    };

    if (!mergedWords.includes(iso)) {
      mergedWords.push(iso);
      added += 1;
    }
  });

  mergedWords.sort((a, b) => a.localeCompare(b));
  return { mergedWords, added, skippedStateClash, iso2Count: countryDisplays.length };
}

function main() {
  const words = loadLockedWords();
  const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  const { mergedWords, added, skippedStateClash, iso2Count } = applyCountryIso2Abbreviations(words, meta);

  fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
  fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

  process.stdout.write(
    `Country ISO2 abbreviations: ${iso2Count} sovereign countries scanned.\n` +
      `Skipped ${skippedStateClash} codes (US state clash).\n` +
      `Added ${added} new dictionary words.\n` +
      `Dictionary total: ${mergedWords.length} words.\n` +
      `place-metadata.json: ${Object.keys(meta).length} entries.\n`
  );
}

if (require.main === module) {
  main();
}

module.exports = { applyCountryIso2Abbreviations };
