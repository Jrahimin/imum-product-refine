import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string>;

/** Parse one semicolon-delimited dataset into string-valued rows. */
export function parseCsv(content: string): CsvRow[] {
  return parse(content, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
}

/** Read and parse one dataset file as UTF-8 CSV. */
export async function readCsvFile(filePath: string): Promise<CsvRow[]> {
  const content = await readFile(filePath, "utf8");
  return parseCsv(content);
}
