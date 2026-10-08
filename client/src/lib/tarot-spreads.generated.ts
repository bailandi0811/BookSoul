// Generated from shared/tarot/spreads.json by scripts/sync-tarot-spreads.mjs.
export const TAROT_SPREADS = [
  {
    id: 'yes_no',
    name: '单张是非',
    description: '一个明确问题的支持或谨慎倾向',
    cardCountRequired: 1,
    positions: [
      {
        id: 'answer',
        label: '是非',
        meaning:
          '结合问题与实际牌义说明偏支持、偏谨慎或信息不足，不作确定保证。',
      },
    ],
  },
  {
    id: 'three_card',
    name: '时间之流',
    description: '理解过去背景、当前状态与后续可能',
    cardCountRequired: 3,
    positions: [
      {
        id: 'past',
        label: '过去',
        meaning: '可能形成当前情况的背景，不是已证实的历史。',
      },
      {
        id: 'present',
        label: '现在',
        meaning: '当前问题呈现的状态与正在起作用的因素。',
      },
      {
        id: 'future',
        label: '未来',
        meaning: '在当前条件下的可能走向，不是事实预测。',
      },
    ],
  },
  {
    id: 'triangle',
    name: '圣三角',
    description: '理解当前状态、关键阻碍与发展可能',
    cardCountRequired: 3,
    positions: [
      {
        id: 'situation',
        label: '现状',
        meaning: '当前问题呈现的状态与关系倾向，不确认他人真实心理。',
      },
      {
        id: 'obstacle',
        label: '阻碍',
        meaning: '限制、矛盾或张力，不等于一定存在外部敌人或第三者。',
      },
      {
        id: 'outlook',
        label: '发展趋势',
        meaning: '综合现状与阻碍说明条件性的进展和可能，不作确定预测。',
      },
    ],
  },
] as const;
export type TarotSpread = (typeof TAROT_SPREADS)[number]['id'];
export type TarotPosition =
  (typeof TAROT_SPREADS)[number]['positions'][number]['id'];
