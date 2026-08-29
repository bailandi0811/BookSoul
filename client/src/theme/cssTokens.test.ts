// client/src/theme/cssTokens.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

describe("claude-style css tokens", () => {
  it("uses coral primary and ivory background in :root", () => {
    expect(css).toMatch(/--primary:\s*217\s+119\s+87/);
    expect(css).toMatch(/--background:\s*250\s+249\s+245/);
    expect(css).toMatch(/--foreground:\s*20\s+20\s+19/);
  });

  it("does not keep vermillion primary as default", () => {
    expect(css).not.toMatch(/--primary:\s*166\s+45\s+45/);
  });
});
