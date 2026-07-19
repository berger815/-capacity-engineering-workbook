export interface CsvTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export function parseCsvRows(input: string, delimiter = ","): string[][] {
  if (delimiter.length !== 1) throw new Error("CSV delimiter must be one character");

  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(values => values.some(value => value.trim().length > 0));
}

export function parseCsvTable(input: string, delimiter = ","): CsvTable {
  const rows = parseCsvRows(input, delimiter);
  const first = rows[0];
  if (!first) throw new Error("CSV is empty");

  const headers = first.map(header => header.trim());
  if (headers.some(header => header.length === 0)) throw new Error("CSV contains a blank header");
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate headers");

  return {
    headers,
    rows: rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))),
  };
}
