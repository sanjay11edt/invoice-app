import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceDocument, amountInWords } from '../src/pdf.js';

const item = { description: 'Development services', period: '01-Aug-2026 to 31-Aug-2026', rate: 1000, hours: 160, amount: 160000 };

test('restored PDF includes all desktop sections and numeric columns', () => {
  const doc = invoiceDocument({ invoice_number: '2026-10', date: '2026-10-01', items: [item], total: 160000 });
  const pdf = doc.output();
  for (const label of ['FROM', 'BILL TO', 'BANK DETAILS', 'RATE / HR', 'HOURS', 'TOTAL AMOUNT', 'Amount in Words:', 'THANK YOU FOR YOUR BUSINESS!']) assert.ok(pdf.includes(label), label);
  assert.equal(doc.getNumberOfPages(), 1);
});

test('long invoices paginate and repeat column headers', () => {
  const doc = invoiceDocument({ items: Array.from({ length: 80 }, () => item), total: 12800000 });
  assert.ok(doc.getNumberOfPages() > 1);
  assert.equal((doc.output().match(/RATE \/ HR/g) || []).length, doc.getNumberOfPages());
});

test('amount words retain Indian numbering', () => {
  assert.equal(amountInWords(323600), 'Three Lakh Twenty Three Thousand Six Hundred Rupees Only');
  assert.equal(amountInWords(0), 'Zero Rupees Only');
  assert.equal(amountInWords(10000000), 'One Crore Rupees Only');
});
