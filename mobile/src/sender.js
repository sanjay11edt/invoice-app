export const senderFields = ['sender_name', 'sender_address', 'sender_phone'];

export function senderProfile(invoices = [], saved = {}) {
  const rows = [...invoices].filter(row => !row.deleted_at).sort((a, b) => String(b.updated_at || b.date || '').localeCompare(String(a.updated_at || a.date || '')));
  return Object.fromEntries(senderFields.map(key => [key, saved[key] || rows.find(row => row[key])?.[key] || '']));
}

export function withSender(invoice, profile = {}) {
  return { ...invoice, ...Object.fromEntries(senderFields.map(key => [key, invoice[key] || profile[key] || (key === 'sender_name' ? invoice.account_name : '') || ''])) };
}
