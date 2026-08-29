import { AssistantResponseDepth, AssistantTone } from '@prisma/client';

export const BOOK_ASSISTANT_NAME_MAX_LENGTH = 80;
export const BOOK_ASSISTANT_INSTRUCTION_MAX_LENGTH = 1_000;

export function defaultBookAssistantName(bookTitle: string): string {
  const suffix = '》阅读助手';
  const prefix = '《';
  const titleLength =
    BOOK_ASSISTANT_NAME_MAX_LENGTH - prefix.length - suffix.length;
  const title = bookTitle.trim().slice(0, titleLength) || '未命名小说';
  return `${prefix}${title}${suffix}`;
}

export const RESPONSE_DEPTH_INSTRUCTION: Record<
  AssistantResponseDepth,
  string
> = {
  [AssistantResponseDepth.BRIEF]: '回答简洁，优先给出结论和最必要的依据。',
  [AssistantResponseDepth.BALANCED]:
    '回答详略适中，说明结论、依据和必要的上下文。',
  [AssistantResponseDepth.DEEP]:
    '可以深入分析人物、叙事和伏笔，但每个小说事实仍必须有可核验依据。',
};

export const TONE_INSTRUCTION: Record<AssistantTone, string> = {
  [AssistantTone.NATURAL]: '使用自然、清晰、不过度表演的语气。',
  [AssistantTone.WARM]: '使用温和、有陪伴感但不失准确性的语气。',
  [AssistantTone.ANALYTICAL]: '使用克制、结构化、偏分析性的语气。',
};
