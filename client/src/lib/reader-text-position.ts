export function splitReadingParagraphs(text: string, startOffset: number): { text: string; startOffset: number; endOffset: number }[] {
  const parts = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + 2048);
    const newline = text.indexOf("\n", start);
    if (newline >= start && newline < end) end = newline + 1;
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    parts.push({ text: text.slice(start, end), startOffset: startOffset + start, endOffset: startOffset + end }); start = end;
  }
  return parts;
}
function textPoint(element: Element, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (offset < (node.textContent?.length ?? 0)) return { node: node as Text, offset };
    offset -= node.textContent?.length ?? 0; node = walker.nextNode();
  }
  return null;
}
function rectAt(element: Element, offset: number): DOMRect | null {
  const point = textPoint(element, offset); if (!point) return null;
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.setEnd(point.node, Math.min(point.node.length, point.offset + 1));
  return range.getClientRects()[0] ?? null;
}
function visibleTextPoint(root: HTMLElement): { offset: number; sectionId: string | null; topGap: number } | null {
  const bounds = root.getBoundingClientRect(), top = bounds.top + 16;
  for (const element of root.querySelectorAll<HTMLElement>("[data-reader-start]")) {
    const box = element.getBoundingClientRect(); if (box.bottom <= top || !box.height) continue;
    if (box.top >= bounds.bottom) return null;
    const length = element.textContent?.length ?? 0;
    let low = 0, high = Math.max(0, length - 1);
    while (low < high) {
      const mid = Math.floor((low + high) / 2), rect = rectAt(element, mid);
      if (rect && rect.top < top - 1) low = mid + 1; else high = mid;
    }
    const text = element.textContent ?? "";
    if (low && /[\uDC00-\uDFFF]/.test(text[low]) && /[\uD800-\uDBFF]/.test(text[low - 1])) low--;
    return { offset: Number(element.dataset.readerStart) + low, sectionId: element.closest<HTMLElement>("[data-reader-section]")?.dataset.readerSection ?? null, topGap: (rectAt(element, low)?.top ?? top) - bounds.top };
  }
  return null;
}
export function measureReadingOffset(root: HTMLElement): number | null { return visibleTextPoint(root)?.offset ?? null; }
export function measureReadingPosition(root: HTMLElement): { sectionId: string; offset: number; topGap: number } | null {
  const point = visibleTextPoint(root);
  return point?.sectionId ? { ...point, sectionId: point.sectionId } : null;
}
export function restoreReadingOffset(root: HTMLElement, offset: number, sectionId?: string, topGap = 16): boolean {
  for (const element of root.querySelectorAll<HTMLElement>("[data-reader-start]")) {
    if (sectionId && element.closest<HTMLElement>("[data-reader-section]")?.dataset.readerSection !== sectionId) continue;
    const start = Number(element.dataset.readerStart), end = Number(element.dataset.readerEnd);
    if (offset < start || offset >= end) continue;
    const rect = rectAt(element, offset - start); if (!rect) return false;
    root.scrollTop += rect.top - root.getBoundingClientRect().top - topGap; return true;
  }
  return false;
}
