import type { Reference } from "@/store/useChatStore";

export const EMAIL_SUBJECT_MAX_LENGTH = 160;
export const EMAIL_TEXT_MAX_LENGTH = 10_000;

interface CreateEmailDraftOptions {
  recipient: string;
  bookTitle: string;
  assistantName: string;
  content: string;
  references?: Reference[];
}

export interface EmailDraft {
  to: string;
  subject: string;
  text: string;
}

function uniqueReferenceLines(references: Reference[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const reference of references) {
    const key = `${reference.sectionOrder}:${reference.sectionTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(
      `- 第 ${reference.sectionOrder} 节「${reference.sectionTitle}」`,
    );
  }
  return lines;
}

function fitPlainText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const marker = "\n\n[内容过长，草稿已截取]";
  return `${value.slice(0, maxLength - marker.length).trimEnd()}${marker}`;
}

export function createEmailDraft({
  recipient,
  bookTitle,
  assistantName,
  content,
  references = [],
}: CreateEmailDraftOptions): EmailDraft {
  const referenceLines = uniqueReferenceLines(references);
  const referencesText =
    referenceLines.length > 0
      ? `\n\n引用出处：\n${referenceLines.join("\n")}`
      : "";
  const footer = `\n\n---\n来自 BookSoul「${assistantName}」`;

  return {
    to: recipient,
    subject: `《${bookTitle}》阅读笔记`.slice(0, EMAIL_SUBJECT_MAX_LENGTH),
    text: fitPlainText(
      `${content.trim()}${referencesText}${footer}`,
      EMAIL_TEXT_MAX_LENGTH,
    ),
  };
}
