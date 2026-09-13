/**
 * Builds data/world-islands-large.json — islands >= 400 sq mi from world-islands.json
 * with Wikidata outlier filtering.
 *
 * Run: npm run build:large-islands
 * Requires: data/world-islands.json (npm run build:islands)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_PATH = path.join(ROOT, "data", "world-islands.json");
const OUT_PATH = path.join(ROOT, "data", "world-islands-large.json");

const MIN_AREA_SQ_MI = 400;
const MIN_AREA_KM2 = MIN_AREA_SQ_MI * 2.5899881103;
const MAX_AREA_SQ_MI_DEFAULT = 90000;
const MAX_AREA_KM2_DEFAULT = MAX_AREA_SQ_MI_DEFAULT * 2.5899881103;
const GREENLAND_MAX_KM2 = 2500000;

/** Islands that may exceed the default area cap (compact ascii keys). */
const MEGA_ISLAND_KEYS = new Set([
  "GREENLAND",
  "NEWGUINEA",
  "BORNEO",
  "MADAGASCAR",
  "BAFFINISLAND",
  "SUMATRA"
]);

function compactKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

function isPlausibleIslandName(name) {
  const trimmed = String(name || "").trim();
  if (trimmed.length < 2) {
    return false;
  }
  if (/^Q\d+$/i.test(trimmed)) {
    return false;
  }
  if (/^Island [A-Z]{1,3}$/i.test(trimmed)) {
    return false;
  }
  if (/\bReef\b/i.test(trimmed)) {
    return false;
  }
  if (/\bAtoll\b/i.test(trimmed)) {
    return false;
  }
  if (/\bIslets?\b/i.test(trimmed)) {
    return false;
  }
  if (/\bNational Park\b/i.test(trimmed)) {
    return false;
  }
  if (/\bProtection Area\b/i.test(trimmed)) {
    return false;
  }
  return true;
}

function isPlausibleIslandArea(name, areaKm2) {
  if (!Number.isFinite(areaKm2) || areaKm2 < MIN_AREA_KM2) {
    return false;
  }
  const key = compactKey(name);
  if (key === "GREENLAND") {
    return areaKm2 <= GREENLAND_MAX_KM2;
  }
  if (MEGA_ISLAND_KEYS.has(key)) {
    return areaKm2 <= GREENLAND_MAX_KM2;
  }
  return areaKm2 <= MAX_AREA_KM2_DEFAULT;
}

function filterLargeIslands(rows) {
  return rows
    .filter((row) => isPlausibleIslandName(row.name) && isPlausibleIslandArea(row.name, row.areaKm2))
    .map((row) => ({
      name: row.name,
      areaKm2: Math.round(Number(row.areaKm2)),
      areaSqMi: Math.round((Number(row.areaKm2) / 2.5899881103) * 10) / 10,
      region: row.region || "—"
    }))
    .sort((a, b) => b.areaKm2 - a.areaKm2);
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing ${SOURCE_PATH}. Run: npm run build:islands`);
  }
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const islands = filterLargeIslands(source);
  fs.writeFileSync(
    OUT_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        minAreaSqMi: MIN_AREA_SQ_MI,
        islandCount: islands.length,
        islands
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  process.stdout.write(
    `world-islands-large.json: ${islands.length} islands >= ${MIN_AREA_SQ_MI} sq mi.\n`
  );
}

module.exports = {
  MIN_AREA_SQ_MI,
  MIN_AREA_KM2,
  filterLargeIslands,
  isPlausibleIslandName,
  isPlausibleIslandArea
};

if (require.main === module) {
  main();
}
