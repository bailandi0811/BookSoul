import {
  assertUploadInput,
  BOOK_PART_BYTES,
  validateParts,
} from './book-upload.policy';

const input = {
  requestId: '11111111-1111-4111-8111-111111111111',
  fileName: '测试.txt',
  byteSize: 12,
  sha256: 'a'.repeat(64),
};
describe('book upload policy', () => {
  it('accepts bounded EPUB/TXT declarations', () => {
    expect(() => assertUploadInput(input)).not.toThrow();
  });
  it.each([
    { byteSize: 0 },
    { byteSize: 50 * 1024 ** 2 + 1 },
    { fileName: '../source.txt' },
    { fileName: 'source.pdf' },
    { sha256: 'untrusted' },
  ])('rejects an unsafe declaration %j', (override) => {
    expect(() => assertUploadInput({ ...input, ...override })).toThrow();
  });
  it('requires actual ordered parts and the exact final size', () => {
    const parts = [
      { number: 1, size: BOOK_PART_BYTES, etag: 'a' },
      { number: 2, size: 1, etag: 'b' },
    ];
    expect(() =>
      validateParts(parts, BOOK_PART_BYTES + 1, BOOK_PART_BYTES),
    ).not.toThrow();
    expect(() =>
      validateParts(parts.slice(0, 1), BOOK_PART_BYTES + 1, BOOK_PART_BYTES),
    ).toThrow();
    expect(() =>
      validateParts(
        [{ ...parts[0], size: BOOK_PART_BYTES + 1 }, parts[1]],
        BOOK_PART_BYTES + 1,
        BOOK_PART_BYTES,
      ),
    ).toThrow();
    expect(() =>
      validateParts([parts[1], parts[0]], BOOK_PART_BYTES + 1, BOOK_PART_BYTES),
    ).toThrow();
  });
});
