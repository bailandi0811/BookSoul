export type CharacterType = "assistant" | "qiaofeng" | "duanyu" | "wangyuyan";

export interface CharacterProfile {
  id: CharacterType;
  name: string;
  shortTitle: string;
  sealChar: string;
  accentCssVar:
    | "--char-assistant"
    | "--char-qiaofeng"
    | "--char-duanyu"
    | "--char-wangyuyan";
  waitingText: string;
  thinkingLabel: string;
  thoughtDoneLabel: (steps: number) => string;
  placeholder: string;
  greeting: string;
  suggestions: string[];
}

export const CHARACTER_IDS: CharacterType[] = [
  "assistant",
  "qiaofeng",
  "duanyu",
  "wangyuyan",
];

export const CHARACTERS: Record<CharacterType, CharacterProfile> = {
  assistant: {
    id: "assistant",
    name: "书魂",
    shortTitle: "《天龙八部》引路人",
    sealChar: "书",
    accentCssVar: "--char-assistant",
    waitingText: "书魂翻检书页…",
    thinkingLabel: "正在翻检书页…",
    thoughtDoneLabel: (n) => `已翻检书页（${n} 处）`,
    placeholder: "向书魂请教…",
    greeting: "书已展开。你想先问原著、地理，还是某一位英雄？",
    suggestions: [
      "乔峰在聚贤庄喝了几碗酒？",
      "无量山在现实中的什么地方？",
      "我现在在哪里？离大理有多远？",
    ],
  },
  qiaofeng: {
    id: "qiaofeng",
    name: "乔峰",
    shortTitle: "丐帮帮主",
    sealChar: "乔",
    accentCssVar: "--char-qiaofeng",
    waitingText: "乔峰沉吟片刻…",
    thinkingLabel: "沉吟中…",
    thoughtDoneLabel: (n) => `沉吟完毕（${n} 步）`,
    placeholder: "向乔峰请教…",
    greeting: "有话不妨直说。是武功、江湖，还是兄弟义气？",
    suggestions: [
      "聚贤庄一事，你怎么看？",
      "降龙十八掌的精要是什么？",
      "你与段誉、虚竹的结义因何而起？",
    ],
  },
  duanyu: {
    id: "duanyu",
    name: "段誉",
    shortTitle: "大理世子",
    sealChar: "段",
    accentCssVar: "--char-duanyu",
    waitingText: "段誉思索片刻…",
    thinkingLabel: "思索中…",
    thoughtDoneLabel: (n) => `思索完毕（${n} 步）`,
    placeholder: "与段誉闲谈…",
    greeting: "兄台有礼。可是要问凌波微步，还是大理风物？",
    suggestions: [
      "凌波微步如何习得？",
      "无量山剑湖宫是怎样的地方？",
      "你与王语嫣初次相遇是在何处？",
    ],
  },
  wangyuyan: {
    id: "wangyuyan",
    name: "王语嫣",
    shortTitle: "曼陀山庄",
    sealChar: "王",
    accentCssVar: "--char-wangyuyan",
    waitingText: "王语嫣细细想来…",
    thinkingLabel: "查阅武学…",
    thoughtDoneLabel: (n) => `查阅完毕（${n} 处）`,
    placeholder: "向王语嫣请教武学…",
    greeting: "我记得不少门派招式。你想问哪一门？",
    suggestions: [
      "少林七十二绝技有哪些？",
      "姑苏慕容的「以彼之道」是何意？",
      "曼陀山庄种的是什么花？",
    ],
  },
};

export function getCharacter(id: CharacterType): CharacterProfile {
  return CHARACTERS[id];
}

/** 侧栏「随身本事」示例（含邮件语义），不进空状态 suggestions */
export const SIDE_ABILITIES = [
  { name: "古今对照", desc: "小说地名对照现实地理" },
  { name: "飞鸽传书", desc: "将片段寄至你的邮箱" },
  { name: "原著回响", desc: "回答有据时附章节出处" },
] as const;

export const QUICK_PROMPTS = [
  "我在哪里？",
  "乔峰是谁？",
  "把刚才那段发到我的邮箱",
] as const;
