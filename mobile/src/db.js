import { openDB } from 'idb';

const dbPromise = openDB('invoice-manager', 1, {
  upgrade(db) {
    const invoices = db.createObjectStore('invoices', { keyPath: 'id' });
    invoices.createIndex('updated_at', 'updated_at');
    db.createObjectStore('settings', { keyPath: 'key' });
  }
});

export async function allInvoices(includeDeleted = false) {
  const rows = await (await dbPromise).getAll('invoices');
  return rows.filter(row => includeDeleted || !row.deleted_at);
}

export async function getInvoice(id) { return (await dbPromise).get('invoices', id); }
export async function putInvoice(invoice) { return (await dbPromise).put('invoices', invoice); }

export async function saveInvoice(invoice) {
  const now = new Date().toISOString();
  const saved = { ...invoice, id: invoice.id || crypto.randomUUID(), updated_at: now, deleted_at: null };
  await putInvoice(saved);
  return saved;
}

export async function deleteInvoice(id) {
  const row = await getInvoice(id);
  if (!row) return;
  await putInvoice({ ...row, updated_at: new Date().toISOString(), deleted_at: new Date().toISOString() });
}

export async function setting(key, fallback = '') {
  return (await dbPromise).get('settings', key).then(row => row?.value ?? fallback);
}
export async function setSetting(key, value) { return (await dbPromise).put('settings', { key, value }); }

export async function importInvoices(rows) {
  const tx = (await dbPromise).transaction(['invoices', 'settings'], 'readwrite');
  rows.forEach((row, index) => tx.objectStore('invoices').put({
    ...row,
    id: row.id || `legacy-${index}-${String(row.invoice_number || '').replace(/[^a-z0-9]/gi, '-')}`,
    updated_at: row.updated_at || '2026-08-07T00:00:00.000Z',
    deleted_at: null
  }));
  tx.objectStore('settings').put({ key: 'last_import', value: new Date().toISOString() });
  await tx.done;
}
