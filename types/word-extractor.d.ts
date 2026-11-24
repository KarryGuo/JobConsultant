/**
 * word-extractor 未随包提供类型声明，这里只声明采集脚本用到的 API：
 * 读取 Word 97-2003 (.doc) 正文。
 */
declare module "word-extractor" {
  class WordDocument {
    getBody(): string;
  }

  class WordExtractor {
    extract(source: Buffer | string): Promise<WordDocument>;
  }

  export = WordExtractor;
}
