import * as XLSX from "xlsx";

export interface WorkbookData {
  sheetNames: string[];
  csvBySheet: Record<string, string>;
}

export interface WorkbookReader {
  read(file: File): Promise<WorkbookData>;
}

export const sheetJsWorkbookReader: WorkbookReader = {
  async read(file: File): Promise<WorkbookData> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const csvBySheet: Record<string, string> = {};
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (sheet) csvBySheet[sheetName] = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    }
    return { sheetNames: workbook.SheetNames, csvBySheet };
  },
};

export async function readTabularFile(file: File, reader: WorkbookReader = sheetJsWorkbookReader): Promise<WorkbookData> {
  const extension = file.name.toLowerCase().split(".").at(-1);
  if (extension === "xlsx" || extension === "xls" || extension === "xlsm" || extension === "xlsb") {
    return reader.read(file);
  }
  return { sheetNames: [file.name], csvBySheet: { [file.name]: await file.text() } };
}
