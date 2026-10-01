import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { emailDefaults, invoiceEmail, recipients, sendInvoiceEmail } from '../src/email.js';

globalThis.crypto ??= webcrypto;

const invoice = { invoice_number: '2026-10', date: '2026-10-01', sender_name: 'Example Consultant', sender_address: '123 Example Road', sender_phone: '1234567890', account_name: 'Example Consultant', items: [{ description: 'Service', period: 'August 2026', rate: 1000, hours: 2, amount: 2000 }, { description: 'Service', period: 'September 2026', rate: 1000, hours: 3, amount: 3000 }], total: 5000 };
const message = { to: 'client@example.com', cc: 'copy@example.com', from: 'sender@example.com', subject: 'Invoice ₹5,000', body: 'Hello,\nPlease see the attached invoice.\nधन्यवाद' };

test('email defaults cover all invoice periods and sender name', () => {
  const result = emailDefaults(invoice);
  assert.ok(result.body.includes('August 2026; September 2026'));
  assert.ok(result.body.includes('Example Consultant'));
  assert.ok(result.subject.includes('2026-10'));
});

test('MIME email preserves Unicode and includes a real PDF attachment', async () => {
  const { mime, raw } = await invoiceEmail(invoice, message);
  assert.equal(Buffer.from(raw, 'base64url').toString('utf8'), mime);
  assert.match(mime, /To: client@example.com\r\nCc: copy@example.com/);
  const subject = mime.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)[1];
  assert.equal(Buffer.from(subject, 'base64').toString('utf8'), message.subject);
  const body = mime.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--/)[1];
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), message.body);
  const attachment = mime.match(/filename\*=UTF-8''[^\r]+\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--/)[1];
  const pdf = Buffer.from(attachment, 'base64').toString('latin1');
  assert.ok(pdf.startsWith('%PDF-'));
  for (const label of ['FROM', 'BANK DETAILS', 'RATE / HR', 'TOTAL AMOUNT', '123 Example Road']) assert.ok(pdf.includes(label), label);
});

test('recipient validation rejects header injection and invalid lists', async () => {
  assert.equal(recipients('a@example.com, b@example.com'), 'a@example.com, b@example.com');
  assert.throws(() => recipients('', true));
  assert.throws(() => recipients('a@example.com\r\nBcc: hidden@example.com'));
  assert.throws(() => recipients('a@example.com; b@example.com'));
  await assert.rejects(invoiceEmail(invoice, { ...message, subject: 'Invoice\nBcc: hidden@example.com' }));
});

test('Gmail sends exactly one request containing the attachment payload', async () => {
  let calls = 0;
  const result = await sendInvoiceEmail('test-token', 'base64url-message', async (url, options) => {
    calls++;
    assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(options.body), { raw: 'base64url-message' });
    return { ok: true, json: async () => ({ id: 'message-id' }) };
  });
  assert.equal(calls, 1);
  assert.equal(result.id, 'message-id');
});

test('Gmail failures never claim success or automatically retry', async () => {
  await assert.rejects(sendInvoiceEmail('token', 'raw', async () => ({ ok: false, status: 401, json: async () => ({}) })), /expired/);
  await assert.rejects(sendInvoiceEmail('token', 'raw', async () => ({ ok: false, status: 403, json: async () => ({}) })), /Enable the Gmail API/);
  let calls = 0;
  await assert.rejects(sendInvoiceEmail('token', 'raw', async () => { calls++; throw Error('Network'); }), /Check Gmail Sent/);
  assert.equal(calls, 1);
});
