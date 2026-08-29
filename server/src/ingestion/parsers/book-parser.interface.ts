import type { BookParseSource, ParsedBook } from '../types/parsed-book';

export interface BookParser {
  parse(source: BookParseSource): Promise<ParsedBook>;
}
