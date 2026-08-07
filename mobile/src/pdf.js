import { jsPDF } from 'jspdf';

const money = value => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;

export function invoicePdf(invoice) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(17, 24, 39); doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255); doc.setFontSize(24); doc.text('INVOICE', 16, 24);
  doc.setFontSize(10); doc.text(`#${invoice.invoice_number || ''}`, 194, 18, { align: 'right' });
  doc.text(invoice.date || '', 194, 25, { align: 'right' });
  doc.setTextColor(17, 24, 39); doc.setFontSize(11);
  doc.text('BILL TO', 16, 52); doc.setFontSize(13); doc.text(invoice.billing_name || invoice.client || '', 16, 61);
  doc.setFontSize(9); doc.text(doc.splitTextToSize(invoice.billing_address || '', 90), 16, 68);
  let y = 92;
  doc.setFillColor(238, 242, 255); doc.rect(16, y - 7, 178, 10, 'F');
  doc.setFontSize(9); doc.text('DESCRIPTION', 19, y); doc.text('PERIOD', 88, y); doc.text('AMOUNT', 190, y, { align: 'right' });
  y += 11;
  (invoice.items || []).forEach(item => {
    doc.text(doc.splitTextToSize(item.description || '', 62), 19, y);
    doc.text(String(item.period || ''), 88, y);
    doc.text(money(item.amount), 190, y, { align: 'right' });
    y += 12;
  });
  doc.line(110, y, 194, y); y += 9;
  doc.setFontSize(13); doc.text('TOTAL', 145, y, { align: 'right' }); doc.text(money(invoice.total), 190, y, { align: 'right' });
  y += 24; doc.setFontSize(9);
  doc.text(`Bank: ${invoice.bank || ''}`, 16, y);
  doc.text(`Account: ${invoice.account_name || ''} / ${invoice.account_number || ''}`, 16, y + 6);
  doc.text(`IFSC: ${invoice.ifsc || ''}`, 16, y + 12);
  return doc.output('blob');
}

export function pdfFilename(invoice) {
  const safe = value => String(value || '').replace(/[\\/:*?"<>|]/g, '-').trim();
  return `Invoice #${safe(invoice.invoice_number)} ${safe(invoice.account_name || 'Invoice')}.pdf`;
}
