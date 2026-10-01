const fields = ['client', 'billing_name', 'billing_address', 'billing_phone', 'bank', 'account_name', 'account_number', 'ifsc', 'sender_name', 'sender_address', 'sender_phone'];
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const monthValue = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;

export function clientPresets(invoices) {
  const presets = new Map();
  [...invoices].filter(x => !x.deleted_at && x.client).sort((a,b) => String(b.date || b.invoice_month || '').localeCompare(String(a.date || a.invoice_month || ''))).forEach(row => {
    if (!presets.has(row.client)) presets.set(row.client, row);
  });
  return [...presets.values()];
}

export function monthlyItems(start, end, source = {}) {
  const valid = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '');
  if (!valid(start) || !valid(end) || start > end) throw Error('Choose a valid start and end month.');
  const templates = source.items || [];
  const cursor = templates.find(x => /cursor/i.test(x.description));
  const service = templates.find(x => !/cursor/i.test(x.description));
  const services = [], subscriptions = [];
  const date = new Date(`${start}-01T00:00:00`);
  while (monthValue(date) <= end) {
    if (services.length >= 24) throw Error('Choose no more than 24 months.');
    const year = date.getFullYear(), month = date.getMonth();
    const period = `01-${months[month]}-${year} to ${new Date(year,month+1,0).getDate()}-${months[month]}-${year}`;
    services.push({ description: service?.description || 'Software Development Services', period, rate: service?.rate ?? 1000, hours: '', amount: '' });
    const rate = cursor?.rate ?? cursor?.amount ?? 1800;
    subscriptions.push({ description: cursor?.description || 'Cursor AI Subscription', period, rate, hours: '-', amount: rate });
    date.setMonth(month+1);
  }
  return [...services, ...subscriptions];
}

export function newInvoiceDefaults(invoices, now = new Date()) {
  const presets = clientPresets(invoices), source = presets[0] || {};
  const start = monthValue(new Date(now.getFullYear(), now.getMonth()-2, 1));
  const end = monthValue(new Date(now.getFullYear(), now.getMonth()-1, 1));
  const base = monthValue(now);
  let number = base, suffix = 2;
  while (invoices.some(row => row.invoice_number === number)) number = `${base}-${suffix++}`;
  return { ...Object.fromEntries(fields.map(key => [key, source[key] ?? ''])), invoice_number: number,
    date: `${base}-${String(now.getDate()).padStart(2,'0')}`, invoice_month: start,
    items: monthlyItems(start, end, source), start, end };
}
