import { openDB } from 'idb';

const dbPromise = openDB('invoice-manager', 2, {
  blocked() {
    const root = document.querySelector('#app');
    if (root) {
      root.innerHTML = `
        <main class="shell">
          <section class="panel">
            <h1>Close the older Invoice Manager tab</h1>
            <p>An older tab is preventing the local database from being updated.</p>
            <p>Close every Invoice Manager tab or installed app window, then reopen this page.</p>
          </section>
        </main>`;
    }
  },
  blocking() {
    window.location.reload();
  },
  upgrade(db) {
    if (!db.objectStoreNames.contains('invoices')) {
      const invoices = db.createObjectStore('invoices', { keyPath: 'id' });
      invoices.createIndex('updated_at', 'updated_at');
    }
    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    if (!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs', { keyPath: 'invoice_id' });
  }
});

export async function allInvoices(includeDeleted = false) {
  const rows = await (await dbPromise).getAll('invoices');
  return rows.filter(row => includeDeleted || !row.deleted_at);
}

export async function getInvoice(id) { return (await dbPromise).get('invoices', id); }
export async function putInvoice(invoice) { return (await dbPromise).put('invoices', invoice); }
export async function getOriginalPdf(invoiceId) { return (await dbPromise).get('pdfs', invoiceId); }
export async function putOriginalPdf(invoiceId, file) {
  return (await dbPromise).put('pdfs', {
    invoice_id: invoiceId,
    blob: file,
    name: file.name,
    size: file.size,
    imported_at: new Date().toISOString()
  });
}
export async function originalPdfIds() { return (await dbPromise).getAllKeys('pdfs'); }

export async function saveInvoice(invoice) {
  const now = new Date().toISOString();
  const saved = { ...invoice, id: invoice.id || crypto.randomUUID(), source: invoice.source || 'created', updated_at: now, deleted_at: null };
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
    source: row.source || 'legacy',
    updated_at: row.updated_at || '2026-08-07T00:00:00.000Z',
    deleted_at: null
  }));
  tx.objectStore('settings').put({ key: 'last_import', value: new Date().toISOString() });
  await tx.done;
}
