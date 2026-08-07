import { putOriginalPdf } from './db.js';

const normalize = value => String(value || '')
  .replace(/\\/g, '/')
  .replace(/^[a-z]:/i, '')
  .replace(/\.xlsx$/i, '.pdf')
  .toLowerCase();

const basename = value => normalize(value).split('/').pop();

export function matchOriginalPdfFiles(files, invoices) {
  const matches = [];
  const unmatched = [];
  const claimed = new Set();

  for (const invoice of invoices) {
    const expectedPath = normalize(invoice.path || invoice.file);
    const expectedName = basename(expectedPath);
    const candidates = files.filter(file => !claimed.has(file) && basename(file.name) === expectedName);
    let selected = candidates[0];
    if (candidates.length > 1) {
      selected = candidates
        .map(file => {
          const relative = normalize(file.webkitRelativePath || file.name);
          const pathParts = expectedPath.split('/').filter(Boolean);
          const overlap = pathParts.filter(part => relative.includes(`/${part}/`) || relative.endsWith(`/${part}`)).length;
          return { file, overlap };
        })
        .sort((a, b) => b.overlap - a.overlap)[0].file;
    }
    if (selected) {
      claimed.add(selected);
      matches.push({ invoice, file: selected });
    } else {
      unmatched.push(invoice);
    }
  }
  return { matches, unmatched, unusedFiles: files.filter(file => !claimed.has(file)) };
}

export async function importOriginalPdfFiles(fileList, invoices) {
  const pdfFiles = [...fileList].filter(file => file.name.toLowerCase().endsWith('.pdf'));
  const result = matchOriginalPdfFiles(pdfFiles, invoices);
  for (const { invoice, file } of result.matches) await putOriginalPdf(invoice.id, file);
  return result;
}
