import { Injectable, Logger } from '@nestjs/common';
import { ImportanceScore, MemoryLevel } from '../interfaces/memory.types';

@Injectable()
export class ImportanceScorerStrategy {
  private readonly logger = new Logger(ImportanceScorerStrategy.name);

  // 高重要性模式
  private readonly HIGH_IMPORTANCE_PATTERNS = [
    /我的名字是([^。]+)/i,
    /我叫([^。，]+)/i,
    /我是([^，]+)[人女生男孩]/i,
    /我喜欢([^。，]+)/i,
    /我不喜欢([^。，]+)/i,
    /我在([^，]+)[住生活工作]/i,
    /我的([^，]+)[是有个]/,
    /我想写小说/i,
    /我的小说是/i,
  ];

  // 中等重要性模式
  private readonly MEDIUM_IMPORTANCE_PATTERNS = [
    /谢谢/,
    /记住了/,
    /以后/,
    /下次/,
    /记住/,
    /关于.*说/i,
    /其实.*是/i,
  ];

  async score(message: string, _context: string[] = []): Promise<ImportanceScore> {
    let score = 0.5; // 基础分
    const reasons: string[] = [];

    // 1. 检查高重要性模式
    for (const pattern of this.HIGH_IMPORTANCE_PATTERNS) {
      if (pattern.test(message)) {
        score += 0.3;
        reasons.push('包含个人信息或重要偏好关键词');
        break;
      }
    }

    // 2. 检查中等重要性模式
    for (const pattern of this.MEDIUM_IMPORTANCE_PATTERNS) {
      if (pattern.test(message)) {
        score += 0.1;
        reasons.push('包含偏好指示词');
        break;
      }
    }

    // 3. 消息长度加权
    if (message.length < 5) {
      score -= 0.2;
      reasons.push('消息过短');
    } else if (message.length > 20) {
      score += 0.1;
      reasons.push('消息内容丰富');
    }

    // 4. 检查是否包含明确的偏好或事实陈述
    if (/喜|讨厌|偏好|兴趣|喜欢/.test(message)) {
      score += 0.15;
      reasons.push('包含偏好相关词汇');
    }

    // 5. 确定存储层级
    let suggestedLevel = MemoryLevel.EPISODIC;
    if (score >= 0.7) {
      suggestedLevel = MemoryLevel.LONG_TERM;
    } else if (score >= 0.55) {
      suggestedLevel = MemoryLevel.SEMANTIC;
    }

    return {
      score: Math.min(1, Math.max(0, score)),
      reasons,
      suggestedLevel,
      extractContent: this.extractKeyContent(message),
    };
  }

  private extractKeyContent(message: string): string | undefined {
    for (const pattern of this.HIGH_IMPORTANCE_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return message.length > 100 ? message.substring(0, 100) + '...' : message;
  }
}
