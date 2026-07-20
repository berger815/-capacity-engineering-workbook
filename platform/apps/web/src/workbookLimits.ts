export const MAX_TABULAR_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 100_000;
export const MAX_WORKBOOK_SHEETS = 50;
export const WORKBOOK_PARSE_TIMEOUT_MS = 20_000;

export function assertTabularFileSize(file: File): void {
  if (file.size > MAX_TABULAR_FILE_BYTES) {
    const limitMb = Math.round(MAX_TABULAR_FILE_BYTES / 1024 / 1024);
    throw new Error(`The selected file is larger than the ${limitMb} MB assessment limit.`);
  }
}
