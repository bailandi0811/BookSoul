export const MAX_BOOK_UPLOAD_MEGABYTES = 50;
export const MAX_BOOK_UPLOAD_BYTES = MAX_BOOK_UPLOAD_MEGABYTES * 1024 * 1024;

type UploadCandidate = Pick<File, "name" | "size">;

export function validateBookUpload(file: UploadCandidate): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "epub" && extension !== "txt") {
    return "请选择 EPUB 或 TXT 小说文件";
  }
  if (file.size > MAX_BOOK_UPLOAD_BYTES) {
    return `文件不能超过 ${MAX_BOOK_UPLOAD_MEGABYTES} MB`;
  }
  return null;
}
