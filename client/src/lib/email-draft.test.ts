import { describe, expect, it } from "vitest";
import {
  createEmailDraft,
  EMAIL_SUBJECT_MAX_LENGTH,
  EMAIL_TEXT_MAX_LENGTH,
} from "./email-draft";

describe("createEmailDraft", () => {
  it("预填账号邮箱并附上去重后的引用出处", () => {
    const draft = createEmailDraft({
      recipient: "reader@example.com",
      bookTitle: "天龙八部",
      assistantName: "书魂",
      content: "一段回答",
      references: [
        {
          bookId: "book-1",
          sectionId: "section-2",
          sectionOrder: 2,
          sectionTitle: "少年游",
          chunkId: "chunk-1",
          chunkIndex: 0,
          excerpt: "原文",
          score: 0.9,
        },
        {
          bookId: "book-1",
          sectionId: "section-2",
          sectionOrder: 2,
          sectionTitle: "少年游",
          chunkId: "chunk-2",
          chunkIndex: 1,
          excerpt: "原文二",
          score: 0.8,
        },
      ],
    });

    expect(draft).toEqual({
      to: "reader@example.com",
      subject: "《天龙八部》阅读笔记",
      text: "一段回答\n\n引用出处：\n- 第 2 节「少年游」\n\n---\n来自 BookSoul「书魂」",
    });
  });

  it("使草稿严格落在服务端长度限制内", () => {
    const draft = createEmailDraft({
      recipient: "reader@example.com",
      bookTitle: "书".repeat(300),
      assistantName: "书魂",
      content: "正".repeat(EMAIL_TEXT_MAX_LENGTH + 100),
    });

    expect(draft.subject).toHaveLength(EMAIL_SUBJECT_MAX_LENGTH);
    expect(draft.text).toHaveLength(EMAIL_TEXT_MAX_LENGTH);
    expect(draft.text).toContain("[内容过长，草稿已截取]");
  });
});
