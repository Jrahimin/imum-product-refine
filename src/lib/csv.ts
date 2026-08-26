import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string>;

export function parseCsv(content: string): CsvRow[] {
  return parse(content, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
}

export async function readCsvFile(filePath: string): Promise<CsvRow[]> {
  const content = await readFile(filePath, "utf8");
  return parseCsv(content);
}
