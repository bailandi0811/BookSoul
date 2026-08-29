import { describe, expect, it } from "vitest";
import {
  MAX_BOOK_UPLOAD_BYTES,
  validateBookUpload,
} from "./book-upload-policy";

describe("book upload policy", () => {
  it("accepts a 35 MB TXT novel", () => {
    expect(
      validateBookUpload({ name: "剑来.txt", size: 35 * 1024 * 1024 }),
    ).toBeNull();
  });

  it("rejects a file above the 50 MB limit", () => {
    expect(
      validateBookUpload({ name: "long.txt", size: MAX_BOOK_UPLOAD_BYTES + 1 }),
    ).toBe("文件不能超过 50 MB");
  });

  it("still rejects unsupported formats", () => {
    expect(validateBookUpload({ name: "novel.pdf", size: 1024 })).toBe(
      "请选择 EPUB 或 TXT 小说文件",
    );
  });
});
