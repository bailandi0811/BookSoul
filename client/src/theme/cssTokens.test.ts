import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
function luminance(values: number[]) {
  const [r, g, b] = values.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("AI library theme readability", () => {
  it.each([":root", ".dark"])("keeps text and button labels readable in %s", (selector) => {
    const declaration = css.slice(css.indexOf(selector)).split("}")[0];
    const color = (name: string) => {
      const match = declaration.match(new RegExp("--" + name + ":\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)"));
      expect(match, name).not.toBeNull();
      return luminance(match!.slice(1).map(Number));
    };
    for (const [foreground, background] of [["foreground", "background"], ["muted-foreground", "background"], ["primary", "background"], ["primary-foreground", "primary"]]) {
      const a = color(foreground), b = color(background);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), foreground).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("provides reading typography and respects reduced motion", () => {
    expect(css).toContain("--font-reading:");
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
