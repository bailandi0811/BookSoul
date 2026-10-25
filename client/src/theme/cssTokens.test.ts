import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const scenic = readFileSync(resolve(__dirname, "./scenic-ui.css"), "utf8");
const community = readFileSync(resolve(__dirname, "../components/CommunityChat/community-chat.css"), "utf8");
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

  it("paints cheaper layers while a screen is moving", () => {
    expect(scenic).toMatch(/html\.screen-moving\s+\.scenic-background img[\s\S]*contain:\s*paint/);
    expect(scenic).toMatch(/html\.screen-moving\s+\.scenic-background::after[\s\S]*opacity:\s*0/);
    expect(scenic).toMatch(/html\.screen-moving(?:\.veil-live)?\s+\.scene-veil::before[\s\S]*transition:\s*none/);
    expect(scenic).toMatch(/html\.screen-moving[\s\S]*backdrop-filter:\s*none/);
    expect(scenic).toMatch(/html\.screen-moving\s+\.app-screen\[data-present="false"\][\s\S]*contain:\s*paint/);
    expect(css).toMatch(/html\.screen-moving[\s\S]*\.glass[\s\S]*backdrop-filter:\s*none/);
    expect(community).toMatch(/html\.screen-moving[\s\S]*backdrop-filter:\s*none/);
  });
});
