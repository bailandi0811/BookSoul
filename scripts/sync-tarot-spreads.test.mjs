import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateSpreads,
  renderSpreadSource,
  syncSpreadModules,
} from "./sync-tarot-spreads.mjs";

const source = new URL("../shared/tarot/spreads.json", import.meta.url);
test("canonical definitions and generated types", async () => {
  const definitions = validateSpreads(
    JSON.parse(await readFile(source, "utf8")),
  );
  assert.deepEqual(
    definitions.map((d) => [d.id, d.cardCountRequired]),
    [
      ["yes_no", 1],
      ["three_card", 3],
      ["triangle", 3],
    ],
  );
  assert.deepEqual(
    definitions[2].positions.map((p) => [p.id, p.label]),
    [
      ["situation", "现状"],
      ["obstacle", "阻碍"],
      ["outlook", "发展趋势"],
    ],
  );
  assert.match(
    await renderSpreadSource(definitions),
    /export type TarotPosition/,
  );
  for (const mutate of [
    (d) => d.push(d[0]),
    (d) => (d[2].positions[1].id = "situation"),
    (d) => (d[0].id = "unknown"),
    (d) => (d[0].name = ""),
    (d) => (d[0].positions[0].meaning = ""),
    (d) => d[2].positions.reverse(),
    (d) => (d[2].cardCountRequired = 1),
  ]) {
    const copy = structuredClone(definitions);
    mutate(copy);
    assert.throws(() => validateSpreads(copy));
  }
});
test("check-only does not overwrite stale targets; sync makes both identical", async () => {
  const directory = await mkdtemp(join(tmpdir(), "booksoul-spreads-"));
  const outputPaths = [
    join(directory, "server.ts"),
    join(directory, "client.ts"),
  ];
  for (const path of outputPaths) await writeFile(path, "stale");
  assert.equal(
    await syncSpreadModules({
      inputPath: source,
      outputPaths,
      checkOnly: true,
    }),
    false,
  );
  assert.equal(await readFile(outputPaths[0], "utf8"), "stale");
  await syncSpreadModules({ inputPath: source, outputPaths, checkOnly: false });
  assert.equal(
    await readFile(outputPaths[0], "utf8"),
    await readFile(outputPaths[1], "utf8"),
  );
  assert.equal(
    await syncSpreadModules({
      inputPath: source,
      outputPaths,
      checkOnly: true,
    }),
    true,
  );
});
