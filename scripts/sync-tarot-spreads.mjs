import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const prettier = createRequire(
  new URL("../server/package.json", import.meta.url),
)("prettier");
const slots = {
  yes_no: ["answer"],
  three_card: ["past", "present", "future"],
  triangle: ["situation", "obstacle", "outlook"],
};
const labels = {
  yes_no: ["是非"],
  three_card: ["过去", "现在", "未来"],
  triangle: ["现状", "阻碍", "发展趋势"],
};
const text = (value) => typeof value === "string" && value.trim().length > 0;
export function validateSpreads(input) {
  if (!Array.isArray(input) || input.length !== 3)
    throw new Error("Invalid spread definitions");
  const ids = Object.keys(slots);
  for (const [index, item] of input.entries()) {
    if (
      !item ||
      item.id !== ids[index] ||
      !text(item.name) ||
      !text(item.description) ||
      item.cardCountRequired !== slots[item.id].length ||
      !Array.isArray(item.positions) ||
      item.positions.length !== slots[item.id].length
    )
      throw new Error("Invalid spread definition");
    for (const [i, p] of item.positions.entries())
      if (
        !p ||
        p.id !== slots[item.id][i] ||
        p.label !== labels[item.id][i] ||
        !text(p.meaning)
      )
        throw new Error("Invalid position definition");
  }
  return input;
}
export async function renderSpreadSource(input) {
  const source =
    "// Generated from shared/tarot/spreads.json by scripts/sync-tarot-spreads.mjs.\nexport const TAROT_SPREADS = " +
    JSON.stringify(validateSpreads(input)) +
    ' as const;\nexport type TarotSpread = (typeof TAROT_SPREADS)[number]["id"];\nexport type TarotPosition = (typeof TAROT_SPREADS)[number]["positions"][number]["id"];\n';
  return prettier.format(source, {
    parser: "typescript",
    singleQuote: true,
    trailingComma: "all",
  });
}
export async function syncSpreadModules({ inputPath, outputPaths, checkOnly }) {
  const content = await renderSpreadSource(
    JSON.parse(await readFile(inputPath, "utf8")),
  );
  let current = true;
  for (const path of outputPaths) {
    if (checkOnly) {
      try {
        if ((await readFile(path, "utf8")) !== content) current = false;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        current = false;
      }
    } else await writeFile(path, content);
  }
  return current;
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  if (process.argv.slice(2).some((arg) => arg !== "--check"))
    throw new Error("Only --check is supported");
  const current = await syncSpreadModules({
    inputPath: new URL("../shared/tarot/spreads.json", import.meta.url),
    outputPaths: [
      "../server/src/tarot/tarot-spreads.generated.ts",
      "../client/src/lib/tarot-spreads.generated.ts",
    ].map((p) => new URL(p, import.meta.url)),
    checkOnly: process.argv.includes("--check"),
  });
  if (!current) process.exitCode = 1;
}
