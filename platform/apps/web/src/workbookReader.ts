import {
  WORKBOOK_PARSE_TIMEOUT_MS,
  assertTabularFileSize,
} from "./workbookLimits.js";

export interface WorkbookData {
  sheetNames: string[];
  csvBySheet: Record<string, string>;
}

export interface WorkbookReader {
  read(file: File): Promise<WorkbookData>;
}

type WorkerResponse =
  | { id: string; ok: true; sheetNames: string[]; csvBySheet: Record<string, string> }
  | { id: string; ok: false; error: string };

export const excelWorkbookReader: WorkbookReader = {
  async read(file: File): Promise<WorkbookData> {
    assertTabularFileSize(file);
    const buffer = await file.arrayBuffer();

    return new Promise<WorkbookData>((resolve, reject) => {
      const worker = new Worker(new URL("./workbookWorker.ts", import.meta.url), { type: "module" });
      const id = crypto.randomUUID();
      const timeout = window.setTimeout(() => {
        worker.terminate();
        reject(new Error("Workbook parsing exceeded the 20 second assessment limit."));
      }, WORKBOOK_PARSE_TIMEOUT_MS);

      const finish = (): void => {
        window.clearTimeout(timeout);
        worker.terminate();
      };

      worker.onerror = () => {
        finish();
        reject(new Error("Workbook parsing failed in the isolated reader."));
      };

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id) return;
        finish();
        if (!event.data.ok) reject(new Error(event.data.error));
        else resolve({ sheetNames: event.data.sheetNames, csvBySheet: event.data.csvBySheet });
      };

      worker.postMessage({ id, buffer }, [buffer]);
    });
  },
};

export async function readTabularFile(file: File, reader: WorkbookReader = excelWorkbookReader): Promise<WorkbookData> {
  assertTabularFileSize(file);
  const extension = file.name.toLowerCase().split(".").at(-1);
  if (extension === "xlsx" || extension === "xlsm") return reader.read(file);
  if (extension === "xls" || extension === "xlsb") {
    throw new Error("Legacy .xls and binary .xlsb workbooks are not accepted. Save the source as .xlsx or CSV first.");
  }
  return { sheetNames: [file.name], csvBySheet: { [file.name]: await file.text() } };
}
