import { invoicePdf, pdfFilename } from './pdf.js';

export const defaultSubject = 'Invoice #{invoice_number} - {sender_name}';
export const defaultBody = 'Dear Professional,\n\nPlease find attached Invoice #{invoice_number} for the period {period}.\nKindly process the payment at your earliest convenience.\n\nLet me know if you have any questions.\n\nThank you,\n{sender_name}';

export function emailDefaults(invoice, config = {}) {
  const values = { invoice_number: invoice.invoice_number || '', sender_name: invoice.sender_name || invoice.account_name || '', billing_name: invoice.billing_name || invoice.client || '', period: [...new Set((invoice.items || []).map(x => x.period).filter(Boolean))].join('; '), month: invoice.invoice_month || '', year: String(invoice.date || '').slice(0, 4) };
  const fill = value => value.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
  return { subject: fill(config.default_subject || defaultSubject), body: fill(config.default_body || defaultBody) };
}

function bytesBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
const utf8Base64 = value => bytesBase64(new TextEncoder().encode(value));
const fold = value => value.match(/.{1,76}/g)?.join('\r\n') || '';

export function recipients(value, required = false) {
  if (/[\r\n]/.test(value)) throw Error('Email addresses must not contain line breaks.');
  const addresses = value.split(',').map(x => x.trim()).filter(Boolean);
  if (required && !addresses.length) throw Error('Enter a recipient email address.');
  if (addresses.some(x => !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(x))) throw Error('Enter valid email addresses separated by commas.');
  return addresses.join(', ');
}

export async function invoiceEmail(invoice, { to, cc = '', from = '', subject, body }) {
  const toHeader = recipients(to, true), ccHeader = recipients(cc), fromHeader = recipients(from);
  if (/[\r\n]/.test(subject)) throw Error('Subject must be a single line.');
  const filename = pdfFilename(invoice).replace(/[\r\n"\\]/g, '_');
  const boundary = `invoice_${crypto.randomUUID()}`;
  const pdf = new Uint8Array(await invoicePdf(invoice).arrayBuffer());
  const mime = [
    'MIME-Version: 1.0', ...(fromHeader ? [`From: ${fromHeader}`] : []), `To: ${toHeader}`, ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
    `Subject: =?UTF-8?B?${utf8Base64(subject)}?=`, `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', fold(utf8Base64(body)),
    `--${boundary}`, 'Content-Type: application/pdf', 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`, '', fold(bytesBase64(pdf)), `--${boundary}--`, ''
  ].join('\r\n');
  return { mime, raw: utf8Base64(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
}

export async function sendInvoiceEmail(token, raw, request = fetch) {
  let response;
  try {
    response = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw })
    });
  } catch {
    throw Error('Delivery status is unknown. Check Gmail Sent before retrying to avoid sending twice.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw Error('Gmail sign-in expired. Connect Gmail again, then send.');
    if (response.status === 403) throw Error(`Gmail could not send: ${result.error?.message || 'Enable the Gmail API for your Google client and allow sending permission.'}`);
    throw Error(result.error?.message || 'Gmail rejected the email.');
  }
  if (!result.id) throw Error('Delivery status is unknown. Check Gmail Sent before retrying.');
  return result;
}
