import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchOriginalPdfFiles } from '../src/pdf-import.js';

test('matches a legacy xlsx record to its original PDF filename', () => {
  const invoices = [{ id: 'one', path: 'd:\\SK\\Client\\Invoices\\January 26\\Invoice #2026-01 Name.xlsx' }];
  const files = [{ name: 'Invoice #2026-01 Name.pdf', webkitRelativePath: 'SK/Client/Invoices/January 26/Invoice #2026-01 Name.pdf' }];
  const result = matchOriginalPdfFiles(files, invoices);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].invoice.id, 'one');
  assert.equal(result.unmatched.length, 0);
});

test('uses path overlap when duplicate filenames exist', () => {
  const invoices = [
    { id: 'a', path: 'd:\\SK\\Client A\\Invoices\\Invoice #01.xlsx' },
    { id: 'b', path: 'd:\\SK\\Client B\\Invoices\\Invoice #01.xlsx' }
  ];
  const files = [
    { name: 'Invoice #01.pdf', webkitRelativePath: 'SK/Client B/Invoices/Invoice #01.pdf' },
    { name: 'Invoice #01.pdf', webkitRelativePath: 'SK/Client A/Invoices/Invoice #01.pdf' }
  ];
  const result = matchOriginalPdfFiles(files, invoices);
  assert.equal(result.matches.find(match => match.invoice.id === 'a').file.webkitRelativePath.includes('Client A'), true);
  assert.equal(result.matches.find(match => match.invoice.id === 'b').file.webkitRelativePath.includes('Client B'), true);
});

test('reports historical invoices without an original PDF', () => {
  const result = matchOriginalPdfFiles([], [{ id: 'missing', file: 'Invoice #missing.xlsx' }]);
  assert.deepEqual(result.unmatched.map(invoice => invoice.id), ['missing']);
});
