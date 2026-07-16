import fs from "node:fs";
import path from "node:path";

const REGIONS = {
  us: ["results-1.js", "results-2.js"],
  eu: ["results-eu-1.js", "results-eu-2.js"],
  asia: ["results-asia-1.js", "results-asia-2.js"]
};
const MAX_RESULT_BYTES = 25 * 1024 * 1024;
const MAX_RESULT_ROWS = 500_000;

function readRows(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing result file: ${file}`);
  const bytes = fs.statSync(file).size;
  if (bytes === 0 || bytes > MAX_RESULT_BYTES) throw new Error(`Implausible result file size (${bytes} bytes): ${file}`);
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/^window\.results\s*=\s*/, "").replace(/;?\s*$/, "");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_RESULT_ROWS) throw new Error(`Implausible result row count: ${file}`);
  return rows;
}

function finite(value) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
}

function compactRow(row) {
  if (Array.isArray(row)) return { id: typeof row[1] === "string" ? row[1] : "", bm: finite(row[3]), sold: finite(row[4]) };
  if (!row || typeof row !== "object") return { id: "", bm: null, sold: null };
  return { id: typeof row.id === "string" ? row.id : "", bm: finite(row.bm), sold: finite(row.sold) };
}

function pickBest(rows) {
  return Array.from(rows.reduce((best, raw) => {
    const next = compactRow(raw);
    if (!next.id) return best;
    const current = best.get(next.id);
    if (!current || (next.bm ?? -Infinity) > (current.bm ?? -Infinity) || ((next.bm ?? -Infinity) === (current.bm ?? -Infinity) && (next.sold ?? -Infinity) > (current.sold ?? -Infinity))) {
      return new Map(best).set(next.id, next);
    }
    return best;
  }, new Map()).values()).map(({ id, bm, sold }) => [id, bm, sold]);
}

const publicDir = path.resolve("public");
const dataDir = path.join(publicDir, "data");
fs.mkdirSync(dataDir, { recursive: true });
const generatedAt = new Date().toISOString();

for (const [region, files] of Object.entries(REGIONS)) {
  const rows = files.flatMap((file) => readRows(path.join(publicDir, file)));
  const items = pickBest(rows);
  if (items.length === 0) throw new Error(`No valid Black Market items for region: ${region}`);
  fs.writeFileSync(path.join(dataDir, `bm-crafter-${region}.json`), JSON.stringify({ generatedAt, region, items }));
}

fs.writeFileSync(path.join(dataDir, "bm-crafter-metadata.json"), JSON.stringify({ generatedAt, sources: Object.values(REGIONS).flat() }));
