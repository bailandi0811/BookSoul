import { describe, expect, it, vi } from "vitest";
import { splitReadingParagraphs, restoreReadingOffset } from "./reader-text-position";
describe("UTF-16 text anchors", () => {
  it("restores the intended chapter when two visible chapters share the same offsets", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div data-reader-section="first"><span data-reader-start="0" data-reader-end="2">前文</span></div><div data-reader-section="second"><span data-reader-start="0" data-reader-end="2">后文</span></div>';
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 300, 600));
    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
      const top = this.startContainer.parentElement?.closest("[data-reader-section]")?.getAttribute("data-reader-section") === "second" ? 240 : 40;
      return [new DOMRect(0, top, 100, 20)] as unknown as DOMRectList;
    });
    try {
      expect(restoreReadingOffset(root, 0, "second")).toBe(true);
      expect(root.scrollTop).toBe(224);
    } finally { vi.restoreAllMocks(); }
  });
  it.each(["  第一行😀\n\n第二行\r\n尾", "长".repeat(50000), "中途😀正文\n"]) ("preserves every unit and absolute offset", text => {
    const parts = splitReadingParagraphs(text, 7999);
    expect(parts.map(p => p.text).join("")).toBe(text);
    let offset = 7999;
    for (const part of parts) { expect(part.startOffset).toBe(offset); offset += part.text.length; expect(part.endOffset).toBe(offset); }
    expect(parts.every(p => p.text.length <= 2048)).toBe(true);
    expect(parts.every(p => !/[\uD800-\uDBFF]$/.test(p.text))).toBe(true);
  });
});
