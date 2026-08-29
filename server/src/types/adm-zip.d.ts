declare module 'adm-zip' {
  interface ZipEntryHeader {
    size: number;
    compressedSize: number;
  }

  export interface ZipEntry {
    entryName: string;
    rawEntryName: Buffer;
    isDirectory: boolean;
    header: ZipEntryHeader;
    getData(): Buffer;
  }

  class AdmZip {
    constructor(filePath?: string | Buffer);
    getEntries(): ZipEntry[];
    getEntry(name: string): ZipEntry | null;
    addFile(entryName: string, content: Buffer): void;
    toBuffer(): Buffer;
    writeZip(targetPath: string): void;
  }

  export = AdmZip;
}
