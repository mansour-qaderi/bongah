import Papa from 'papaparse';
import { MAX_FILE_BYTES, MAX_FILE_ROWS, tableFrom, type FileTable } from './parse-file';
import { tNow } from '@/i18n/active';

export class FileImportError extends Error {}

function decode(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Excel on Windows saves "CSV" in the Arabic code page unless told otherwise.
    return new TextDecoder('windows-1256').decode(buffer);
  }
}

/** Reads a .csv, .tsv, .txt or .xlsx file into a header row and text rows. Throws FileImportError with a Persian reason. */
export async function readTableFile(file: File): Promise<FileTable> {
  if (file.size > MAX_FILE_BYTES) throw new FileImportError(tNow('import.file.tooBig'));
  if (file.size === 0) throw new FileImportError(tNow('import.file.empty'));
  const name = file.name.toLowerCase();

  let table: FileTable;
  if (name.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file');
    try {
      const grid = await readXlsxFile(file);
      table = tableFrom(grid);
    } catch {
      throw new FileImportError(tNow('import.file.excelUnreadable'));
    }
  } else if (name.endsWith('.xls')) {
    throw new FileImportError(tNow('import.file.xlsOld'));
  } else if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    const text = decode(await file.arrayBuffer()).replace(/^﻿/, '');
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t', '|'] });
    if (parsed.data.length === 0) throw new FileImportError(tNow('import.file.empty'));
    table = tableFrom(parsed.data);
  } else {
    throw new FileImportError(tNow('import.file.onlyCsvXlsx'));
  }

  if (table.headers.length === 0) throw new FileImportError(tNow('import.file.noHeader'));
  if (table.rows.length === 0) throw new FileImportError(tNow('import.file.headerOnly'));
  if (table.rows.length > MAX_FILE_ROWS) {
    throw new FileImportError(tNow('import.file.tooManyRows', { max: MAX_FILE_ROWS }));
  }
  return table;
}
