import { Injectable } from '@nestjs/common';
import { ImportanceScore, MemoryLevel } from '../interfaces/memory.types';

@Injectable()
export class ImportanceScorerStrategy {
  // 只有明确的个人事实、偏好或“请记住”指令才有资格进入长期记忆。
  private readonly HIGH_IMPORTANCE_PATTERNS = [
    /我的名字是([^。]+)/i,
    /我叫([^。，]+)/i,
    /我(?:最|更|很)?喜欢([^。，；]+)/i,
    /我(?:不喜欢|讨厌)([^。，；]+)/i,
    /我(?:住在|来自)([^。，；]+)/i,
    /我在([^，。；]+)工作/i,
    /我的(?:职业|工作|爱好|兴趣)是([^。，；]+)/i,
    /以后(?:回答|聊天|称呼)[^。；]{0,80}/i,
  ];

  private readonly EXPLICIT_MEMORY_PATTERNS = [
    /请记住/i,
    /记住(?:我|这|以后)/i,
    /别忘了/i,
    /下次(?:请|要|记得)/i,
  ];

  private readonly SENSITIVE_PATTERNS = [
    /密码|口令|验证码|支付密码/i,
    /api[_ -]?key|access[_ -]?token|refresh[_ -]?token/i,
    /身份证|银行卡|信用卡/i,
    /私钥|助记词|secret/i,
  ];

  async score(
    message: string,
    _context: string[] = [],
  ): Promise<ImportanceScore> {
    const normalized = message.trim();
    const reasons: string[] = [];

    if (this.SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return {
        score: 0,
        reasons: ['疑似包含敏感凭据，不自动保存'],
        suggestedLevel: MemoryLevel.EPISODIC,
      };
    }

    let score = 0.1;

    for (const pattern of this.HIGH_IMPORTANCE_PATTERNS) {
      if (pattern.test(normalized)) {
        score += 0.7;
        reasons.push('包含明确的个人事实或偏好');
        break;
      }
    }

    for (const pattern of this.EXPLICIT_MEMORY_PATTERNS) {
      if (pattern.test(normalized)) {
        score = Math.max(score, 0.9);
        reasons.push('用户明确要求记住');
        break;
      }
    }

    if (/偏好|兴趣|喜欢|讨厌/.test(normalized) && score >= 0.7) {
      score += 0.05;
    }

    let suggestedLevel = MemoryLevel.EPISODIC;
    if (score >= 0.7) {
      suggestedLevel = MemoryLevel.LONG_TERM;
    } else if (score >= 0.45) {
      suggestedLevel = MemoryLevel.SEMANTIC;
    }

    return {
      score: Math.min(1, Math.max(0, score)),
      reasons,
      suggestedLevel,
      extractContent: this.extractKeyContent(normalized),
    };
  }

  private extractKeyContent(message: string): string | undefined {
    for (const pattern of this.HIGH_IMPORTANCE_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return message.length > 500 ? `${message.substring(0, 500)}...` : message;
  }
}
