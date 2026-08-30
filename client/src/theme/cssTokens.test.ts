// client/src/theme/cssTokens.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

describe("cream reading-room css tokens", () => {
  it("uses terracotta primary and cream paper colors in :root", () => {
    expect(css).toMatch(/--primary:\s*168\s+73\s+49/);
    expect(css).toMatch(/--background:\s*247\s+242\s+233/);
    expect(css).toMatch(/--foreground:\s*45\s+39\s+34/);
  });

  it("defines warm surface layers and a reading typeface", () => {
    expect(css).toMatch(/--surface-soft:\s*249\s+240\s+227/);
    expect(css).toMatch(/--surface-tint:\s*246\s+226\s+211/);
    expect(css).toContain("--font-reading:");
  });
});
