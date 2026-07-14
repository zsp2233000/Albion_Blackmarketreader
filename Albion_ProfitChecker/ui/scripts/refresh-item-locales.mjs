import { writeFile } from "node:fs/promises";

const SOURCE_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json";
const OUTPUT_URL = new URL("../src/shared/i18n/itemNames.zh-TW.json", import.meta.url);

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`Unable to download Albion item data: ${response.status} ${response.statusText}`);
}

const records = await response.json();
if (!Array.isArray(records)) throw new Error("Unexpected Albion item data format");

const names = Object.fromEntries(
  records
    .map((record) => [String(record.UniqueName || "").trim().toUpperCase(), String(record.LocalizedNames?.["ZH-TW"] || "").trim()])
    .filter(([itemId, name]) => Boolean(itemId && name))
);

await writeFile(OUTPUT_URL, `${JSON.stringify(names, null, 2)}\n`, "utf8");
console.log(`Wrote ${Object.keys(names).length} Traditional Chinese item names.`);
