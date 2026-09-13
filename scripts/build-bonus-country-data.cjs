/**
 * Builds data/bonus-country-data.json — country centroids, land neighbors, island distractors.
 * Run: npm run build:bonus-countries
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const META_PATH = path.join(ROOT, "place-metadata.json");
const CATEGORIES_PATH = path.join(ROOT, "dictionary-categories.json");
const CACHE_DIR = path.join(ROOT, "geonames-cache");
const COUNTRY_INFO_PATH = path.join(CACHE_DIR, "countryInfo.txt");
const OUT_PATH = path.join(ROOT, "data", "bonus-country-data.json");
const COUNTRIES_JSON_URL =
  "https://raw.githubusercontent.com/mledoze/countries/master/countries.json";
const COUNTRY_INFO_URL = "https://download.geonames.org/export/dump/countryInfo.txt";

const ISLAND_DISTRACTORS = {
  ICELAND: ["NORWAY", "UNITED KINGDOM", "IRELAND"],
  MALTA: ["ITALY", "TUNISIA", "GREECE"],
  CYPRUS: ["TURKEY", "GREECE", "SYRIA"],
  "SRI LANKA": ["INDIA", "MALDIVES", "BANGLADESH"],
  MADAGASCAR: ["MOZAMBIQUE", "MAURITIUS", "SOUTH AFRICA"],
  JAPAN: ["SOUTH KOREA", "CHINA", "PHILIPPINES"],
  PHILIPPINES: ["INDONESIA", "MALAYSIA", "VIETNAM"],
  INDONESIA: ["MALAYSIA", "PAPUA NEW GUINEA", "AUSTRALIA"],
  AUSTRALIA: ["INDONESIA", "PAPUA NEW GUINEA", "NEW ZEALAND"],
  "NEW ZEALAND": ["AUSTRALIA", "FIJI", "PAPUA NEW GUINEA"],
  FIJI: ["VANUATU", "NEW ZEALAND", "AUSTRALIA"],
  CUBA: ["UNITED STATES", "MEXICO", "JAMAICA"],
  JAMAICA: ["CUBA", "HAITI", "DOMINICAN REPUBLIC"],
  HAITI: ["DOMINICAN REPUBLIC", "CUBA", "JAMAICA"],
  "DOMINICAN REPUBLIC": ["HAITI", "CUBA", "JAMAICA"],
  "PAPUA NEW GUINEA": ["INDONESIA", "AUSTRALIA", "PHILIPPINES"],
  IRELAND: ["UNITED KINGDOM", "FRANCE", "ICELAND"],
  "UNITED KINGDOM": ["IRELAND", "FRANCE", "NORWAY"],
  BAHAMAS: ["UNITED STATES", "CUBA", "JAMAICA"],
  MALDIVES: ["INDIA", "SRI LANKA", "INDONESIA"],
  MAURITIUS: ["MADAGASCAR", "SOUTH AFRICA", "INDIA"],
  SEYCHELLES: ["MADAGASCAR", "MAURITIUS", "INDIA"],
  COMOROS: ["MADAGASCAR", "MOZAMBIQUE", "TANZANIA"],
  CAPE_VERDE: ["SENEGAL", "MAURITANIA", "GAMBIA"],
  CABO_VERDE: ["SENEGAL", "MAURITANIA", "GAMBIA"],
  SINGAPORE: ["MALAYSIA", "INDONESIA", "THAILAND"],
  BAHRAIN: ["SAUDI ARABIA", "QATAR", "IRAN"],
  TIMOR_LESTE: ["INDONESIA", "AUSTRALIA", "PHILIPPINES"],
  "TIMOR LESTE": ["INDONESIA", "AUSTRALIA", "PHILIPPINES"]
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrl(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function ensureCountryInfo() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(COUNTRY_INFO_PATH)) {
    process.stdout.write("Downloading GeoNames countryInfo.txt…\n");
    const buf = await fetchUrl(COUNTRY_INFO_URL);
    fs.writeFileSync(COUNTRY_INFO_PATH, buf);
  }
}

function parseCountryInfo(text) {
  const isoToNeighbors = {};
  text.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith("#")) {
      return;
    }
    const cols = line.split("\t");
    if (cols.length < 18) {
      return;
    }
    const iso = cols[0];
    if (iso.length !== 2) {
      return;
    }
    isoToNeighbors[iso] = String(cols[17] || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  });
  return isoToNeighbors;
}

function displayName(key) {
  return key
    .split(" ")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

async function main() {
  await ensureCountryInfo();
  const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, "utf8"));
  const countryInfoText = fs.readFileSync(COUNTRY_INFO_PATH, "utf8");
  const isoToNeighbors = parseCountryInfo(countryInfoText);

  process.stdout.write("Downloading mledoze/countries centroids…\n");
  const countriesJson = JSON.parse((await fetchUrl(COUNTRIES_JSON_URL)).toString("utf8"));
  const isoToLatLng = {};
  countriesJson.forEach((entry) => {
    const iso = entry?.cca2;
    const latlng = entry?.latlng;
    if (iso && Array.isArray(latlng) && latlng.length === 2) {
      isoToLatLng[iso] = { lat: latlng[0], lng: latlng[1] };
    }
  });

  const isoToKey = {};
  categories.countries.forEach((key) => {
    const iso = meta[key]?.iso;
    if (iso) {
      isoToKey[iso] = key;
    }
  });

  const countries = {};
  for (const key of categories.countries) {
    const iso = meta[key]?.iso;
    if (!iso) {
      continue;
    }
    const latlng = isoToLatLng[iso];
    if (!latlng) {
      continue;
    }
    const neighborKeys = (isoToNeighbors[iso] || [])
      .map((neighborIso) => isoToKey[neighborIso])
      .filter(Boolean)
      .filter((neighborKey) => neighborKey !== key);

    const entry = {
      name: meta[key]?.country || displayName(key),
      iso,
      lat: latlng.lat,
      lng: latlng.lng,
      neighbors: [...new Set(neighborKeys)]
    };

    const islandOverride = ISLAND_DISTRACTORS[key];
    if (islandOverride) {
      entry.islandDistractors = islandOverride.filter(
        (distractorKey) => distractorKey !== key && categories.countries.includes(distractorKey)
      );
    }

    countries[key] = entry;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    countryCount: Object.keys(countries).length,
    countries
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  process.stdout.write(`Wrote ${payload.countryCount} countries → ${OUT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
