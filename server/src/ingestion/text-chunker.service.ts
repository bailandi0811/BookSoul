import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TextChunk {
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

@Injectable()
export class TextChunkerService {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(configService: ConfigService) {
    this.chunkSize = configService.get<number>('books.chunkSize') || 800;
    this.chunkOverlap = configService.get<number>('books.chunkOverlap') ?? 120;
    if (this.chunkSize <= 0 || this.chunkOverlap < 0) {
      throw new Error('Book chunk settings must be non-negative');
    }
    if (this.chunkOverlap >= this.chunkSize) {
      throw new Error('Book chunk overlap must be smaller than chunk size');
    }
  }

  chunk(content: string): TextChunk[] {
    if (!content.trim()) return [];

    const chunks: TextChunk[] = [];
    let start = 0;
    while (start < content.length) {
      const idealEnd = Math.min(start + this.chunkSize, content.length);
      const splitEnd = this.findSplitEnd(content, start, idealEnd);
      const raw = content.slice(start, splitEnd);
      const leadingWhitespace = raw.length - raw.trimStart().length;
      const trailingWhitespace = raw.length - raw.trimEnd().length;
      const actualStart = start + leadingWhitespace;
      const actualEnd = splitEnd - trailingWhitespace;

      if (actualEnd > actualStart) {
        chunks.push({
          chunkIndex: chunks.length,
          content: content.slice(actualStart, actualEnd),
          startOffset: actualStart,
          endOffset: actualEnd,
        });
      }

      if (splitEnd >= content.length) break;
      const overlapAnchor = actualEnd > start ? actualEnd : splitEnd;
      start = Math.max(start + 1, overlapAnchor - this.chunkOverlap);
    }
    return chunks;
  }

  private findSplitEnd(
    content: string,
    start: number,
    idealEnd: number,
  ): number {
    if (idealEnd >= content.length) return content.length;
    const minimumEnd = Math.min(
      idealEnd,
      start + Math.floor(this.chunkSize * 0.6),
    );
    for (const separator of [
      '\n\n',
      '\n',
      '。',
      '！',
      '？',
      '. ',
      '! ',
      '? ',
    ]) {
      const boundary = content.lastIndexOf(separator, idealEnd - 1);
      if (boundary >= minimumEnd) return boundary + separator.length;
    }
    return idealEnd;
  }
}
