export interface ParsedSection {
  order: number;
  title: string;
  content: string;
  sourceRef?: string;
}

export interface ParsedBook {
  title: string;
  author?: string;
  language?: string;
  sections: ParsedSection[];
}

export interface BookParseSource {
  filePath: string;
  originalFileName: string;
}
