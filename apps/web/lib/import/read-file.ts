import Papa from 'papaparse';
import { MAX_FILE_BYTES, MAX_FILE_ROWS, tableFrom, type FileTable } from './parse-file';

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
  if (file.size > MAX_FILE_BYTES) throw new FileImportError('حجم فایل بیش از ۵ مگابایت است.');
  if (file.size === 0) throw new FileImportError('فایل خالی است.');
  const name = file.name.toLowerCase();

  let table: FileTable;
  if (name.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file');
    try {
      const grid = await readXlsxFile(file);
      table = tableFrom(grid);
    } catch {
      throw new FileImportError('فایل اکسل خوانده نشد. آن را دوباره با فرمت xlsx ذخیره کنید، یا به CSV تبدیل کنید.');
    }
  } else if (name.endsWith('.xls')) {
    throw new FileImportError('فرمت قدیمی xls پشتیبانی نمی‌شود. در اکسل «Save As» کنید و xlsx یا CSV را بدهید.');
  } else if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    const text = decode(await file.arrayBuffer()).replace(/^﻿/, '');
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t', '|'] });
    if (parsed.data.length === 0) throw new FileImportError('فایل خالی است.');
    table = tableFrom(parsed.data);
  } else {
    throw new FileImportError('فقط فایل‌های CSV و xlsx پذیرفته می‌شود.');
  }

  if (table.headers.length === 0) throw new FileImportError('ردیف عنوان ستون‌ها پیدا نشد.');
  if (table.rows.length === 0) throw new FileImportError('فایل فقط ردیف عنوان دارد و آگهی‌ای در آن نیست.');
  if (table.rows.length > MAX_FILE_ROWS) {
    throw new FileImportError(`فایل بیش از ${MAX_FILE_ROWS} ردیف دارد. آن را به چند فایل کوچک‌تر تقسیم کنید.`);
  }
  return table;
}
