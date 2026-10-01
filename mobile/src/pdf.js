import { jsPDF } from 'jspdf';

const colors = { ink: '#1e293b', accent: '#6366f1', banner: '#4f46e5', muted: '#64748b', light: '#f8fafc', border: '#cbd5e1', white: '#ffffff' };
const money = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function amountInWords(value) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function words(n) {
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]} ${words(n % 10)}`.trim();
    for (const [unit, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']]) {
      if (n >= unit) return `${words(Math.floor(n / unit))} ${label} ${words(n % unit)}`.trim();
    }
  }
  const n = Math.trunc(Number(value || 0));
  return `${n < 0 ? 'Minus ' : ''}${words(Math.abs(n)) || 'Zero'} Rupees Only`;
}

// Uses the desktop pdf_gen.py layout; all personal details come from invoice data.
export function invoiceDocument(invoice) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18, width = 174, bottom = 279;
  let y = margin + 2.1;
  const font = (size = 8.5, bold = false, color = colors.ink) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
  };
  const box = (x, top, w, h, fill, border = false) => {
    doc.setFillColor(fill); doc.setDrawColor(colors.border); doc.setLineWidth(0.14);
    doc.rect(x, top, w, h, border ? 'FD' : 'F');
  };
  const text = (value, x, top, options = {}) => doc.text(String(value ?? ''), x, top, options);
  const wrap = (value, w) => doc.splitTextToSize(String(value ?? ''), w);
  const ensure = height => { if (y + height > bottom) { doc.addPage(); y = margin; return true; } return false; };
  // Draw the rupee glyph as vectors: built-in PDF fonts do not contain U+20B9.
  const currency = (value, right, baseline, size = 8.5, bold = false, color = colors.ink) => {
    font(size, bold, color);
    const number = money(value), glyph = size * 0.19, x = right - doc.getTextWidth(number) - glyph - 0.65;
    const top = baseline - size * 0.25;
    doc.setDrawColor(color); doc.setLineWidth(bold ? 0.24 : 0.18);
    doc.line(x, top, x + glyph, top); doc.line(x, top + glyph * 0.34, x + glyph, top + glyph * 0.34);
    doc.lines([[glyph * 1.05, 0, glyph * 1.05, glyph * 0.7, 0, glyph * 0.7]], x, top, [1, 1], 'S');
    doc.line(x, top + glyph * 0.7, x + glyph * 0.85, baseline);
    text(number, right, baseline, { align: 'right' });
  };

  doc.setFillColor(colors.banner); doc.roundedRect(margin, y, width, 25.4, 2.1, 2.1, 'F');
  font(26, true, colors.white); text('INVOICE', margin + 3.5, y + 16.6);
  font(7, true, '#c7d2fe'); text('INVOICE #', 139, y + 6.3);
  font(10, true, colors.white); text(invoice.invoice_number, 139, y + 10.6);
  font(7, true, '#c7d2fe'); text('DATE', 139, y + 15.8);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(invoice.date || '') ? new Date(`${invoice.date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : invoice.date;
  font(10, true, colors.white); text(date, 139, y + 20.4);
  y += 31.4;

  const blocks = [
    ['FROM', [invoice.sender_name || invoice.account_name, invoice.sender_address, invoice.sender_phone]],
    ['BILL TO', [invoice.billing_name || invoice.client, String(invoice.billing_address || '').replace(/, /g, '\n'), invoice.billing_phone]],
    ['BANK DETAILS', [invoice.bank, invoice.account_number ? `A/C: ${invoice.account_number}` : '', invoice.ifsc ? `IFSC: ${invoice.ifsc}` : '', invoice.account_name ? `Name: ${invoice.account_name}` : '']]
  ];
  const blockWidth = (width - 4) / 3;
  font();
  const lines = blocks.map(([, rows]) => rows.filter(x => String(x ?? '').trim()).flatMap(x => String(x).split('\n').map(line => wrap(line, blockWidth - 4.2))));
  const heights = lines.map(rows => 5.65 + rows.reduce((sum, line) => sum + line.length * 4.2 + 2.47, 0));
  const infoHeight = Math.max(...heights);
  blocks.forEach(([title], index) => {
    const x = margin + 2.8 + index * blockWidth;
    box(x, y, blockWidth, infoHeight, colors.light, true); box(x, y, blockWidth, 5.65, colors.accent);
    font(7, true, colors.white); text(title, x + 2.1, y + 4.3);
    font(); let baseline = y + 10; lines[index].forEach(row => { row.forEach(line => { text(line, x + 2.1, baseline); baseline += 4.2; }); baseline += 2.47; });
  });
  y += infoHeight + 5;

  const widths = [width * .38, width * .22, width * .13, width * .12, width * .15];
  const xs = widths.map((_, i) => margin + widths.slice(0, i).reduce((a, b) => a + b, 0));
  function tableHeader() {
    box(margin, y, width, 7.1, colors.ink, true); font(7.5, true, colors.white);
    ['DESCRIPTION', 'PERIOD', 'RATE / HR', 'HOURS', 'AMOUNT'].forEach((label, i) => text(label, i < 2 ? xs[i] + 2.1 : xs[i] + widths[i] - 2.1, y + 4.7, { align: i < 2 ? 'left' : 'right' }));
    y += 7.1;
  }
  font(8, false, colors.muted);
  const words = wrap(`Amount in Words: ${amountInWords(invoice.total)}`, width);
  ensure(20); tableHeader();
  (invoice.items || []).forEach((item, index) => {
    font();
    const description = wrap(item.description, widths[0] - 4.2);
    const period = wrap(String(item.period || ''), widths[1] - 4.2);
    // Split exceptionally long entries across pages, repeating column headers.
    let offset = 0;
    const count = Math.max(description.length, period.length, 1);
    const rowHeight = count * 4.2 + 3.5;
    const footerHeight = index === invoice.items.length - 1 ? 32 + words.length * 4 : 0;
    if (rowHeight + footerHeight <= bottom - margin - 7.1 && y + rowHeight + footerHeight > bottom) { doc.addPage(); y = margin; tableHeader(); }
    while (offset < count) {
      if (y + 8 > bottom) { doc.addPage(); y = margin; tableHeader(); }
      const take = Math.min(count - offset, Math.max(1, Math.floor((bottom - y - 3.5) / 4.2)));
      const height = take * 4.2 + 3.5;
      box(margin, y, width, height, index % 2 === 0 ? colors.light : colors.white, true);
      font(); description.slice(offset, offset + take).forEach((line, i) => text(line, xs[0] + 2.1, y + 4.3 + i * 4.2));
      font(8.5, false, colors.muted); period.slice(offset, offset + take).forEach((line, i) => text(line, xs[1] + 2.1, y + 4.3 + i * 4.2));
      if (!offset) {
        currency(item.rate, xs[2] + widths[2] - 2.1, y + 4.3);
        font(); text(String(item.hours ?? '').trim() || '-', xs[3] + widths[3] - 2.1, y + 4.3, { align: 'right' });
        currency(item.amount, xs[4] + widths[4] - 2.1, y + 4.3, 9, true);
      }
      y += height; offset += take;
    }
  });
  font(8, false, colors.muted);
  ensure(32 + words.length * 4);
  box(margin, y, width, 11.5, colors.banner);
  font(10, true, colors.white); text('TOTAL AMOUNT', 142, y + 7.5, { align: 'right' });
  currency(invoice.total, 189, y + 7.5, 14, true, colors.white);
  y += 17; font(8, false, colors.muted);
  words.forEach((line, i) => text(line, margin, y + i * 4)); y += words.length * 4 + 6;
  doc.setDrawColor(colors.border); doc.setLineWidth(.18); doc.line(margin, y, margin + width, y);
  font(11, true, colors.accent); text('THANK YOU FOR YOUR BUSINESS!', margin, y + 8);
  return doc;
}

export function invoicePdf(invoice) { return invoiceDocument(invoice).output('blob'); }

export function pdfFilename(invoice) {
  const safe = value => String(value || '').replace(/[\\/:*?"<>|]/g, '-').trim();
  return `Invoice #${safe(invoice.invoice_number)} ${safe(invoice.account_name || 'Invoice')}.pdf`;
}
