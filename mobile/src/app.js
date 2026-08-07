import './style.css';
import './settings-button.css';
import { allInvoices, deleteInvoice, getInvoice, importInvoices, originalPdfIds, saveInvoice, setting, setSetting } from './db.js';
import { invoicePdf, pdfFilename } from './pdf.js';
import { syncDrive } from './drive.js';
import { importOriginalPdfFiles } from './pdf-import.js';

let query = '';
const app = document.querySelector('#app');
const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

async function bootstrap() {
  renderList();
}

async function renderList() {
  const rows = (await allInvoices()).filter(row => [row.invoice_number, row.client, row.billing_name, row.invoice_month].join(' ').toLowerCase().includes(query));
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const lastSync = await setting('last_sync');
  app.innerHTML = `
    <header><div><span class="eyebrow">LOCAL-FIRST</span><h1>Invoices</h1></div><button class="sync" id="sync">↻ Sync</button></header>
    <main>
      <section class="summary"><div><span>${rows.length}</span><small>Invoices</small></div><div><span>${money(total)}</span><small>Total</small></div></section>
      <div class="sync-status">${lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : 'Not synced yet'} · Data stays on this device</div>
      <div class="toolbar"><input id="search" type="search" value="${esc(query)}" placeholder="Search invoices…"><button id="settings" class="settings-button">⚙ Settings</button></div>
      <section class="list">${rows.length ? rows.sort((a,b) => String(b.invoice_month).localeCompare(String(a.invoice_month))).map(card).join('') : '<div class="empty">No invoices found</div>'}</section>
    </main>
    <button class="fab" id="new" aria-label="New invoice">＋</button>`;
  document.querySelector('#search').addEventListener('input', event => { query = event.target.value.toLowerCase(); renderList(); });
  document.querySelector('#new').onclick = () => renderForm();
  document.querySelector('#settings').onclick = renderSettings;
  document.querySelector('#sync').onclick = runSync;
  document.querySelectorAll('[data-id]').forEach(element => element.onclick = () => renderDetail(element.dataset.id));
}

function card(row) {
  const month = /^\d{4}-\d{2}$/.test(row.invoice_month || '') ? new Date(`${row.invoice_month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'No month';
  return `<article class="card" data-id="${esc(row.id)}"><div class="card-top"><b>#${esc(row.invoice_number)}</b><span>${month}</span></div><h2>${esc(row.billing_name || row.client)}</h2><div class="card-bottom"><span>${esc(row.client)}</span><strong>${money(row.total)}</strong></div></article>`;
}

async function renderDetail(id) {
  const row = await getInvoice(id); if (!row) return renderList();
  app.innerHTML = `<header><button class="back">‹</button><div><span class="eyebrow">INVOICE</span><h1>#${esc(row.invoice_number)}</h1></div><button class="icon" id="edit">Edit</button></header>
  <main><section class="detail"><div class="label">Billed to</div><h2>${esc(row.billing_name || row.client)}</h2><p>${esc(row.billing_address)}</p>
  <div class="facts"><div><small>Invoice month</small><b>${esc(row.invoice_month)}</b></div><div><small>Invoice date</small><b>${esc(row.date)}</b></div></div>
  <div class="line-items">${(row.items || []).map(item => `<div><span><b>${esc(item.description)}</b><small>${esc(item.period)}</small></span><strong>${money(item.amount)}</strong></div>`).join('')}</div>
  <div class="grand-total"><span>Total</span><strong>${money(row.total)}</strong></div></section>
  <div class="actions"><button id="pdf">Download PDF</button>${row.drive_pdf_url ? `<button id="drive" class="secondary">Open in Drive</button>` : ''}<button id="delete" class="danger">Delete</button></div></main>`;
  document.querySelector('.back').onclick = renderList;
  document.querySelector('#edit').onclick = () => renderForm(row);
  document.querySelector('#pdf').onclick = () => { const link = document.createElement('a'); link.href = URL.createObjectURL(invoicePdf(row)); link.download = pdfFilename(row); link.click(); URL.revokeObjectURL(link.href); };
  if (row.drive_pdf_url) document.querySelector('#drive').onclick = () => window.open(row.drive_pdf_url, '_blank');
  document.querySelector('#delete').onclick = async () => { if (confirm('Delete this invoice? It will be removed from other devices on the next sync.')) { await deleteInvoice(id); renderList(); } };
}

function newItem(item = {}) {
  return `<div class="item"><input data-field="description" placeholder="Description" value="${esc(item.description)}"><input data-field="period" placeholder="01-Aug-2026 to 31-Aug-2026" value="${esc(item.period)}"><div><input data-field="rate" type="number" placeholder="Rate" value="${esc(item.rate)}"><input data-field="hours" type="number" placeholder="Hours" value="${esc(item.hours)}"><input data-field="amount" type="number" placeholder="Amount" value="${esc(item.amount)}"></div><button type="button" class="remove">Remove item</button></div>`;
}

function renderForm(row = {}) {
  const today = new Date().toISOString().slice(0, 10);
  app.innerHTML = `<header><button class="back">‹</button><div><span class="eyebrow">${row.id ? 'EDIT' : 'NEW'}</span><h1>Invoice</h1></div><button id="save" class="sync">Save</button></header>
  <main><form id="form"><section class="form-card"><label>Invoice number<input name="invoice_number" required value="${esc(row.invoice_number)}"></label><label>Invoice date<input name="date" type="date" required value="${esc(row.date || today)}"></label><label>Client<input name="client" required value="${esc(row.client)}"></label><label>Billed to<input name="billing_name" required value="${esc(row.billing_name)}"></label><label>Address<textarea name="billing_address">${esc(row.billing_address)}</textarea></label></section>
  <div class="section-title"><h2>Line items</h2><button type="button" id="add">＋ Add</button></div><section id="items">${(row.items?.length ? row.items : [{}]).map(newItem).join('')}</section>
  <section class="form-card"><h2>Payment details</h2><label>Bank<input name="bank" value="${esc(row.bank)}"></label><label>Account holder<input name="account_name" value="${esc(row.account_name)}"></label><label>Account number<input name="account_number" value="${esc(row.account_number)}"></label><label>IFSC<input name="ifsc" value="${esc(row.ifsc)}"></label></section></form></main>`;
  document.querySelector('.back').onclick = () => row.id ? renderDetail(row.id) : renderList();
  document.querySelector('#add').onclick = () => { document.querySelector('#items').insertAdjacentHTML('beforeend', newItem()); bindRemove(); };
  bindRemove();
  document.querySelector('#save').onclick = async () => {
    const form = document.querySelector('#form'); if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    const items = [...document.querySelectorAll('.item')].map(item => Object.fromEntries([...item.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value]))).map(item => ({ ...item, rate: Number(item.rate), hours: Number(item.hours), amount: Number(item.amount) }));
    const period = items.map(item => item.period).join(' ').match(/\b\d{1,2}-([A-Za-z]{3,9})-(\d{4})\b/);
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const invoice_month = period ? `${period[2]}-${String(months.indexOf(period[1].slice(0,3).toLowerCase()) + 1).padStart(2,'0')}` : '';
    const saved = await saveInvoice({ ...row, ...values, items, invoice_month, total: items.reduce((sum, item) => sum + item.amount, 0) });
    renderDetail(saved.id);
  };
}

function bindRemove() { document.querySelectorAll('.remove').forEach(button => button.onclick = () => button.closest('.item').remove()); }

async function renderSettings() {
  const clientId = await setting('google_client_id');
  const invoiceRows = await allInvoices();
  const pdfCount = (await originalPdfIds()).length;
  app.innerHTML = `<header><button class="back">‹</button><div><span class="eyebrow">APP</span><h1>Settings</h1></div></header><main><section class="form-card"><h2>Google Drive</h2><p class="help">Paste the Web OAuth Client ID created for this app in Google Cloud. It is safe to store on the device; never paste a client secret.</p><label>OAuth Client ID<input id="client-id" value="${esc(clientId)}" placeholder="…apps.googleusercontent.com"></label><button id="save-settings">Save settings</button></section><section class="form-card"><h2>Import desktop invoices</h2><p class="help">First select invoices_data.json. Then select the laptop folder containing the original PDFs. Historical PDFs are preserved exactly and are never regenerated.</p><label>Invoice data file<input id="import-file" type="file" accept="application/json,.json"></label><label>Original PDF folder<input id="pdf-folder" type="file" accept="application/pdf,.pdf" webkitdirectory multiple></label><p class="help" id="pdf-status">${pdfCount} original PDFs imported for ${invoiceRows.length} invoices.</p></section><section class="form-card"><h2>How sync works</h2><p class="help">Sync merges invoices using their last modification time and uploads original PDFs to Invoice App / Invoices in your Google Drive. Missing historical PDFs are reported and skipped.</p></section></main>`;
  document.querySelector('.back').onclick = renderList;
  document.querySelector('#save-settings').onclick = async () => { await setSetting('google_client_id', document.querySelector('#client-id').value.trim()); alert('Settings saved'); renderList(); };
  document.querySelector('#import-file').onchange = async event => {
    try {
      const rows = JSON.parse(await event.target.files[0].text());
      if (!Array.isArray(rows)) throw new Error('The selected file is not an invoice list.');
      await importInvoices(rows); alert(`Imported ${rows.length} invoices.`); renderList();
    } catch (error) { alert(`Import failed: ${error.message}`); }
  };
  document.querySelector('#pdf-folder').onchange = async event => {
    const status = document.querySelector('#pdf-status');
    try {
      status.textContent = 'Matching original PDFs…';
      const result = await importOriginalPdfFiles(event.target.files, await allInvoices());
      status.textContent = `${result.matches.length} original PDFs matched; ${result.unmatched.length} invoices still missing an original PDF.`;
    } catch (error) { status.textContent = `PDF import failed: ${error.message}`; }
  };
}

async function runSync() {
  const button = document.querySelector('#sync'); button.disabled = true;
  try {
    const result = await syncDrive(message => button.textContent = message);
    const missing = result.missingOriginals.length ? ` ${result.missingOriginals.length} historical PDFs were missing and skipped.` : '';
    alert(`Sync complete. ${result.invoices} invoices are up to date.${missing}`);
  }
  catch (error) { alert(error.message); }
  renderList();
}

bootstrap();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
