import fs from "node:fs/promises";
import path from "node:path";

const publicData = path.join(process.cwd(), "public", "data");
const iconsDir = path.join(process.cwd(), "public", "itemicons");
const CDN = "https://render.albiononline.com/v1/item";

const read = async (f) => JSON.parse(await fs.readFile(path.join(publicData, f), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [food, potions, ingredients] = await Promise.all([
  read("recipes-food.json"), read("recipes-potions.json"), read("consumable-ingredients.json"),
]);
const ids = [...new Set([
  ...food.recipes.map((r) => r.itemId),
  ...potions.recipes.map((r) => r.itemId),
  ...ingredients.ingredients.map((i) => i.itemId),
])];

let ok = 0, skip = 0, fail = 0;
for (const id of ids) {
  const dest = path.join(iconsDir, `${id}.png`);
  try { await fs.access(dest); skip += 1; continue; } catch { /* download */ }
  try {
    const res = await fetch(`${CDN}/${id}.png?quality=1`);
    if (!res.ok) { fail += 1; console.log("FAIL", id, res.status); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
    ok += 1;
    await sleep(60);
  } catch (e) { fail += 1; console.log("ERR", id, e.message); }
}
console.log(`icons: ${ok} downloaded, ${skip} existed, ${fail} failed, total ${ids.length}`);
