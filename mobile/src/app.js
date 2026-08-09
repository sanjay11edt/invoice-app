import '../../static/style.css';
import './responsive.css';
import { allInvoices, deleteInvoice, getInvoice, getOriginalPdf, importInvoices, originalPdfIds, saveInvoice, setting, setSetting } from './db.js';
import { invoicePdf, pdfFilename } from './pdf.js';
import { syncDrive } from './drive.js';
import { importOriginalPdfFiles } from './pdf-import.js';

const app = document.querySelector('#app');
const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let invoices = [], page = 'dashboard', editingId = null, modalId = null, sortKey = 'date', sortAsc = false;

function layout() {
  app.innerHTML = `
    <button class="mobile-menu" id="mobile-menu" aria-label="Open navigation">☰</button>
    <div class="sidebar-scrim" id="sidebar-scrim"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand"><div class="brand-icon">MK</div><div class="brand-text"><span class="brand-name">InvoiceApp</span><span class="brand-sub">Monika Kumawat</span></div></div>
      <nav class="sidebar-nav">
        ${nav('dashboard','📊','Dashboard')}${nav('invoices','📋','All Invoices')}${nav('create','➕','New Invoice')}${nav('settings','⚙️','Settings')}
      </nav>
      <div class="sidebar-footer"><div class="sidebar-stats-mini"><div class="mini-stat"><span class="mini-label">Total Invoices</span><span class="mini-value" id="mini-count">—</span></div><div class="mini-stat"><span class="mini-label">Total Billed</span><span class="mini-value" id="mini-total">—</span></div></div></div>
    </aside>
    <main class="main" id="main"><section class="page active"><div class="startup-loading"><h1>Invoice Manager</h1><p>Opening your local invoices…</p></div></section></main>
    <div class="modal-overlay" id="modal-overlay"><div class="modal"><div class="modal-header"><div><h2 class="modal-title" id="modal-title"></h2><p class="modal-sub" id="modal-sub"></p></div><div class="modal-actions"><button class="btn btn-sm btn-accent" id="modal-pdf">📥 PDF</button><button class="btn btn-sm btn-outline" id="modal-edit">✏️ Edit</button><button class="btn-icon" id="modal-close">✕</button></div></div><div class="modal-body" id="modal-body"></div></div></div>
    <div class="toast" id="toast"></div>`;
  document.querySelectorAll('[data-page]').forEach(link => link.onclick = e => { e.preventDefault(); showPage(link.dataset.page); });
  document.querySelector('#mobile-menu').onclick = toggleMenu;
  document.querySelector('#sidebar-scrim').onclick = closeMenu;
  document.querySelector('#modal-overlay').onclick = e => { if (e.target.id === 'modal-overlay') closeModal(); };
  document.querySelector('#modal-close').onclick = closeModal;
}

function nav(name, icon, label) { return `<a href="#${name}" class="nav-item" id="nav-${name}" data-page="${name}"><span class="nav-icon">${icon}</span>${label}</a>`; }
function toggleMenu() { document.body.classList.toggle('menu-open'); }
function closeMenu() { document.body.classList.remove('menu-open'); }
function toast(message, kind = 'success') { const el = document.querySelector('#toast'); el.textContent = message; el.className = `toast show ${kind}`; setTimeout(() => el.className = 'toast', 3000); }

async function refresh() {
  invoices = await allInvoices();
  document.querySelector('#mini-count').textContent = invoices.length;
  document.querySelector('#mini-total').textContent = money(invoices.reduce((s, x) => s + Number(x.total || 0), 0));
}

async function showPage(name) {
  page = name; closeMenu();
  document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.page === name));
  await refresh();
  if (name === 'dashboard') renderDashboard();
  if (name === 'invoices') renderInvoices();
  if (name === 'create') renderForm();
  if (name === 'settings') await renderSettings();
  window.scrollTo(0, 0);
}

function financialYear(date = new Date()) { const y = date.getFullYear(), start = date.getMonth() < 3 ? y - 1 : y; return `${start}-${String(start + 1).slice(-2)}`; }
function invoiceFY(row) { const value = row.invoice_month || row.date || '2000-01-01'; return financialYear(new Date(value.length === 7 ? `${value}-01T00:00:00` : value)); }
function monthLabel(value) { return /^\d{4}-\d{2}$/.test(value || '') ? new Date(`${value}-01T00:00:00`).toLocaleDateString('en-IN', { month:'short', year:'numeric' }) : '—'; }
function groupBy(rows, key) { return rows.reduce((out, row) => { const name = key(row) || 'Unknown'; out[name] = (out[name] || 0) + Number(row.total || 0); return out; }, {}); }
function bars(groups) { const entries = Object.entries(groups).sort((a,b) => b[1]-a[1]), max = Math.max(...entries.map(x => x[1]), 1); return entries.length ? entries.map(([name,value]) => `<div class="bar-row"><span class="bar-label">${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${value/max*100}%"></div></div><strong>${money(value)}</strong></div>`).join('') : '<div class="empty-state">No invoice data</div>'; }

function renderDashboard() {
  const total = invoices.reduce((s,x) => s + Number(x.total || 0), 0), clients = new Set(invoices.map(x => x.client).filter(Boolean));
  const year = String(new Date().getFullYear()), fy = financialYear();
  const recent = [...invoices].sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0,5);
  document.querySelector('#main').innerHTML = `<section class="page active"><div class="page-header"><div><h1 class="page-title">Dashboard</h1><p class="page-subtitle">Overview of all invoicing activity</p></div><button class="btn btn-primary sync-top">↻ Sync</button></div>
    <div class="stats-grid">${stat('purple','📄','Total Invoices',invoices.length)}${stat('indigo','💰','Total Billed',money(total))}${stat('cyan','🏢','Clients',clients.size)}${stat('rose','📅','This Year',money(invoices.filter(x => String(x.invoice_month || x.date).startsWith(year)).reduce((s,x)=>s+Number(x.total||0),0)))}${stat('green','🧾',`FY ${fy}`,money(invoices.filter(x => invoiceFY(x)===fy).reduce((s,x)=>s+Number(x.total||0),0)))}</div>
    <div class="charts-row"><div class="chart-card"><h3 class="chart-title">Revenue by Client</h3><div class="chart-area">${bars(groupBy(invoices,x=>x.client))}</div></div><div class="chart-card"><h3 class="chart-title">Yearly Revenue</h3><div class="chart-area">${bars(groupBy(invoices,x=>String(x.invoice_month||x.date).slice(0,4)))}</div></div></div>
    <div class="recent-card"><div class="recent-header"><h3 class="chart-title">Recent Invoices</h3><a href="#invoices" class="view-all">View all →</a></div><div>${recent.map(recentRow).join('') || '<div class="empty-state">No invoices yet</div>'}</div></div></section>`;
  document.querySelector('.sync-top').onclick = runSync;
  document.querySelector('.view-all').onclick = e => { e.preventDefault(); showPage('invoices'); };
  bindOpen();
}
function stat(color, icon, label, value) { return `<div class="stat-card ${color}"><div class="stat-icon">${icon}</div><div class="stat-body"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div></div>`; }
function recentRow(row) { return `<div class="recent-row open-invoice" data-id="${esc(row.id)}"><div class="invoice-num">#${esc(row.invoice_number)}</div><div class="recent-client">${esc(row.billing_name || row.client)}</div><div class="recent-date">${monthLabel(row.invoice_month)}</div><div class="recent-amount">${money(row.total)}</div></div>`; }

function renderInvoices() {
  const clients = [...new Set(invoices.map(x=>x.client).filter(Boolean))].sort(), years = [...new Set(invoices.map(x=>String(x.invoice_month||x.date).slice(0,4)).filter(Boolean))].sort().reverse(), fys = [...new Set(invoices.map(invoiceFY))].sort().reverse();
  document.querySelector('#main').innerHTML = `<section class="page active"><div class="page-header"><div><h1 class="page-title">All Invoices</h1><p class="page-subtitle">Browse and manage existing invoices</p></div><div class="header-actions"><div class="search-box"><span class="search-icon">🔍</span><input id="search-input" placeholder="Search invoices…"></div><select id="client-filter" class="filter-select"><option value="">All Clients</option>${options(clients)}</select><select id="year-filter" class="filter-select"><option value="">All Calendar Years</option>${options(years)}</select><select id="fy-filter" class="filter-select"><option value="">All Financial Years</option>${options(fys)}</select></div></div>
    <div class="invoice-summary-grid"><div class="invoice-summary-card"><div class="invoice-summary-label">Showing</div><div class="invoice-summary-value" id="summary-count">0</div></div><div class="invoice-summary-card total"><div class="invoice-summary-label">Total Amount</div><div class="invoice-summary-value" id="summary-total">₹0</div></div><div class="invoice-summary-card"><div class="invoice-summary-label">Clients</div><div class="invoice-summary-value" id="summary-clients">0</div></div><div class="invoice-summary-card"><div class="invoice-summary-label">Average</div><div class="invoice-summary-value" id="summary-average">₹0</div></div></div>
    <div class="invoice-table-wrap"><table class="invoice-table"><thead><tr>${th('invoice_number','Invoice #')}${th('invoice_month','Invoice Month')}${th('client','Client')}${th('billing_name','Billed To')}${th('date','Date')}${th('total','Amount')}<th>Actions</th></tr></thead><tbody id="invoice-tbody"></tbody></table></div></section>`;
  ['search-input','client-filter','year-filter','fy-filter'].forEach(id => document.querySelector(`#${id}`).oninput = filterInvoices);
  document.querySelectorAll('[data-sort]').forEach(x => x.onclick = () => { sortAsc = sortKey === x.dataset.sort ? !sortAsc : true; sortKey = x.dataset.sort; filterInvoices(); });
  filterInvoices();
}
function options(values) { return values.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(''); }
function th(key,label) { return `<th data-sort="${key}">${label} <span class="sort-icon">↕</span></th>`; }
function filterInvoices() {
  const q = document.querySelector('#search-input').value.toLowerCase(), client = document.querySelector('#client-filter').value, year = document.querySelector('#year-filter').value, fy = document.querySelector('#fy-filter').value;
  let rows = invoices.filter(x => (!q || [x.invoice_number,x.client,x.billing_name,x.invoice_month].join(' ').toLowerCase().includes(q)) && (!client || x.client===client) && (!year || String(x.invoice_month||x.date).startsWith(year)) && (!fy || invoiceFY(x)===fy));
  rows.sort((a,b) => (String(a[sortKey]??'').localeCompare(String(b[sortKey]??''),undefined,{numeric:true})) * (sortAsc?1:-1));
  document.querySelector('#invoice-tbody').innerHTML = rows.map(x=>`<tr><td data-label="Invoice"><span class="invoice-number-link open-invoice" data-id="${esc(x.id)}">#${esc(x.invoice_number)}</span></td><td data-label="Month">${monthLabel(x.invoice_month)}</td><td data-label="Client"><span class="client-badge">${esc(x.client)}</span></td><td data-label="Billed To">${esc(x.billing_name)}</td><td data-label="Date">${esc(x.date)}</td><td data-label="Amount" class="amount-cell">${money(x.total)}</td><td class="mobile-card-action"><button class="btn btn-sm btn-outline open-invoice" data-id="${esc(x.id)}">View Invoice</button></td></tr>`).join('') || '<tr class="empty-row"><td colspan="7" class="empty-state">No invoices found</td></tr>';
  const total = rows.reduce((s,x)=>s+Number(x.total||0),0); document.querySelector('#summary-count').textContent=rows.length; document.querySelector('#summary-total').textContent=money(total); document.querySelector('#summary-clients').textContent=new Set(rows.map(x=>x.client)).size; document.querySelector('#summary-average').textContent=money(rows.length?total/rows.length:0); bindOpen();
}
function bindOpen() { document.querySelectorAll('.open-invoice').forEach(x => x.onclick = () => openModal(x.dataset.id)); }

async function openModal(id) {
  const row = await getInvoice(id); if (!row) return; modalId=id;
  document.querySelector('#modal-title').textContent=`Invoice #${row.invoice_number}`; document.querySelector('#modal-sub').textContent=`${row.date || ''} · ${monthLabel(row.invoice_month)}`;
  document.querySelector('#modal-body').innerHTML=`<div class="invoice-detail-grid"><div><div class="detail-label">BILLED TO</div><h3>${esc(row.billing_name||row.client)}</h3><p>${esc(row.billing_address||'')}</p><p>${esc(row.billing_phone||'')}</p></div><div><div class="detail-label">PAYMENT DETAILS</div><p><strong>${esc(row.bank||'')}</strong><br>${esc(row.account_name||'')}<br>${esc(row.account_number||'')}<br>${esc(row.ifsc||'')}</p></div></div><div class="detail-items-wrap"><table class="detail-items"><thead><tr><th>Description</th><th>Period</th><th>Rate</th><th>Hours</th><th>Amount</th></tr></thead><tbody>${(row.items||[]).map(i=>`<tr><td data-label="Description">${esc(i.description)}</td><td data-label="Period">${esc(i.period)}</td><td data-label="Rate">${money(i.rate)}</td><td data-label="Hours">${esc(i.hours)}</td><td data-label="Amount">${money(i.amount)}</td></tr>`).join('')}</tbody></table></div><div class="detail-total"><span>Total</span><strong>${money(row.total)}</strong></div><div class="detail-actions">${row.drive_pdf_url?'<button class="btn btn-outline" id="open-drive">Open original in Drive</button>':''}<button class="btn danger-btn" id="delete-invoice">Delete Invoice</button></div>`;
  document.querySelector('#modal-overlay').classList.add('open');
  document.querySelector('#modal-pdf').onclick=()=>downloadPdf(row); document.querySelector('#modal-edit').onclick=()=>{closeModal();renderForm(row);};
  if(row.drive_pdf_url) document.querySelector('#open-drive').onclick=()=>window.open(row.drive_pdf_url,'_blank');
  document.querySelector('#delete-invoice').onclick=async()=>{if(confirm('Delete this invoice?')){await deleteInvoice(id);closeModal();await showPage(page);}};
}
function closeModal(){document.querySelector('#modal-overlay').classList.remove('open');modalId=null;}
async function downloadPdf(row){
  const original = await getOriginalPdf(row.id);
  const historical = row.source === 'legacy' || String(row.id).startsWith('legacy-');
  if (historical && !original) {
    if (row.drive_pdf_url) {
      window.open(row.drive_pdf_url, '_blank');
      return;
    }
    toast('Original PDF is not available. Import it in Settings and sync again.', 'error');
    return;
  }
  const blob = original?.blob || invoicePdf(row), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = original?.name || pdfFilename(row); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function itemRow(item={}) { return `<div class="item-row"><input data-field="description" placeholder="Description" value="${esc(item.description)}"><input data-field="period" placeholder="01-Aug-2026 to 31-Aug-2026" value="${esc(item.period)}"><input data-field="rate" type="number" step="any" placeholder="Rate" value="${esc(item.rate)}"><input data-field="hours" type="number" step="any" placeholder="Hours" value="${esc(item.hours)}"><input data-field="amount" type="number" step="any" placeholder="Amount" value="${esc(item.amount)}"><button type="button" class="remove-item" aria-label="Remove line item" title="Remove line item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/></svg></button></div>`; }
function renderForm(row={}) {
  editingId=row.id||null; const today=new Date().toISOString().slice(0,10);
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page==='create'));
  document.querySelector('#main').innerHTML=`<section class="page active"><div class="page-header"><div><h1 class="page-title">${editingId?'Edit':'New'} Invoice</h1><p class="page-subtitle">Fill in the details to generate an invoice</p></div><button class="btn btn-outline" id="reset-form">Reset</button></div><form id="invoice-form"><div class="form-grid"><div class="form-section"><h3 class="form-section-title">Invoice Details</h3><div class="form-row"><div class="field"><label>Invoice Number</label><input name="invoice_number" required value="${esc(row.invoice_number)}"></div><div class="field"><label>Date</label><input name="date" type="date" required value="${esc(row.date||today)}"></div><div class="field"><label>Invoice Month</label><input name="invoice_month" type="month" readonly value="${esc(row.invoice_month)}"></div></div><h3 class="form-section-title bill-to-title">Bill To</h3><div class="form-row"><div class="field"><label>Client</label><input name="client" required value="${esc(row.client)}"></div><div class="field"><label>Company / Name</label><input name="billing_name" required value="${esc(row.billing_name)}"></div></div><div class="form-row"><div class="field"><label>Phone</label><input name="billing_phone" value="${esc(row.billing_phone)}"></div><div class="field"><label>Address</label><textarea name="billing_address" rows="2">${esc(row.billing_address)}</textarea></div></div></div><div class="form-section"><h3 class="form-section-title">Bank Details</h3><div class="field"><label>Bank Name</label><input name="bank" value="${esc(row.bank||'State Bank Of India')}"></div><div class="form-row"><div class="field"><label>Account Holder</label><input name="account_name" value="${esc(row.account_name||'Monika Kumawat')}"></div><div class="field"><label>Account Number</label><input name="account_number" value="${esc(row.account_number||'61196677074')}"></div></div><div class="field"><label>IFSC Code</label><input name="ifsc" value="${esc(row.ifsc||'SBIN0011305')}"></div><div class="preview-box"><div class="preview-label">TOTAL</div><div class="preview-amount" id="preview-amount">${money(row.total)}</div><div class="preview-words">Calculated from line items</div></div></div></div><div class="form-section line-section"><div class="section-row"><h3 class="form-section-title">Line Items</h3><button type="button" class="btn btn-sm btn-accent" id="add-item">+ Add Item</button></div><div class="items-header"><span>Description</span><span>Period</span><span>Rate / Hr</span><span>Hours</span><span>Amount</span><span></span></div><div id="items-container">${(row.items?.length?row.items:[{}]).map(itemRow).join('')}</div></div><div class="form-actions"><button class="btn btn-primary" type="submit">💾 Save Invoice</button>${editingId?'<button class="btn btn-outline" type="button" id="cancel-edit">Cancel</button>':''}</div></form></section>`;
  document.querySelector('#reset-form').onclick=()=>renderForm(); document.querySelector('#add-item').onclick=()=>{document.querySelector('#items-container').insertAdjacentHTML('beforeend',itemRow());bindItems();}; if(editingId)document.querySelector('#cancel-edit').onclick=()=>showPage('invoices'); bindItems(); document.querySelector('#invoice-form').onsubmit=saveForm;
}
function bindItems(){document.querySelectorAll('.remove-item').forEach(x=>x.onclick=()=>{x.closest('.item-row').remove();calculateTotal();});document.querySelectorAll('.item-row input').forEach(x=>x.oninput=()=>{if(['rate','hours'].includes(x.dataset.field)){const row=x.closest('.item-row'),rate=Number(row.querySelector('[data-field=rate]').value),hours=Number(row.querySelector('[data-field=hours]').value);row.querySelector('[data-field=amount]').value=(rate*hours)||'';}deriveMonth();calculateTotal();});}
function deriveMonth(){const period=[...document.querySelectorAll('[data-field=period]')].map(x=>x.value).join(' '),m=period.match(/\b\d{1,2}[-\s/]([A-Za-z]{3,9}|\d{1,2})[-\s/](\d{4})\b/);if(!m)return;const names=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],month=/^\d+$/.test(m[1])?Number(m[1]):names.indexOf(m[1].slice(0,3).toLowerCase())+1;if(month>0)document.querySelector('[name=invoice_month]').value=`${m[2]}-${String(month).padStart(2,'0')}`;}
function calculateTotal(){const total=[...document.querySelectorAll('[data-field=amount]')].reduce((s,x)=>s+Number(x.value||0),0);document.querySelector('#preview-amount').textContent=money(total);return total;}
async function saveForm(e){e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;const values=Object.fromEntries(new FormData(form)),items=[...document.querySelectorAll('.item-row')].map(r=>Object.fromEntries([...r.querySelectorAll('[data-field]')].map(x=>[x.dataset.field,['rate','hours','amount'].includes(x.dataset.field)?Number(x.value||0):x.value])));const old=editingId?await getInvoice(editingId):{};await saveInvoice({...old,...values,items,total:items.reduce((s,x)=>s+x.amount,0)});toast(editingId?'Invoice updated':'Invoice saved');showPage('invoices');}

async function renderSettings(){const clientId=await setting('google_client_id'),lastSync=await setting('last_sync'),pdfCount=(await originalPdfIds()).length;document.querySelector('#main').innerHTML=`<section class="page active"><div class="page-header"><div><h1 class="page-title">Settings</h1><p class="page-subtitle">Google Drive backup and desktop data import</p></div></div><div class="form-grid settings-grid"><div class="form-section"><h3 class="form-section-title">Google Drive</h3><p class="setting-help">Your invoice data and original PDFs sync to a private Invoice App folder in your Google Drive.</p><div class="field"><label>OAuth Client ID</label><input id="client-id" value="${esc(clientId)}" placeholder="…apps.googleusercontent.com"></div><button class="btn btn-primary" id="save-settings">Save Settings</button><button class="btn btn-accent" id="settings-sync">↻ Authorize & Sync</button><p class="setting-help">${lastSync?`Last synced ${new Date(lastSync).toLocaleString()}`:'Not synced yet'}</p></div><div class="form-section"><h3 class="form-section-title">Import Existing Invoices</h3><ol class="import-steps"><li>Select <strong>invoices_data.json</strong>.</li><li>Select the top-level laptop folder containing the original PDFs.</li><li>Press <strong>Authorize & Sync</strong> after matching finishes. Imported originals will replace previously generated Drive PDFs.</li></ol><div class="field"><label>1. Invoice data JSON</label><input id="import-file" type="file" accept=".json,application/json"></div><div class="field"><label>2. Original PDF folder</label><input id="pdf-folder" type="file" accept=".pdf,application/pdf" webkitdirectory multiple></div><p class="setting-help" id="pdf-status">${pdfCount} original PDFs stored locally for ${invoices.length} invoices.</p></div></div></section>`;document.querySelector('#save-settings').onclick=async()=>{await setSetting('google_client_id',document.querySelector('#client-id').value.trim());toast('Settings saved');};document.querySelector('#settings-sync').onclick=runSync;document.querySelector('#import-file').onchange=async e=>{try{const rows=JSON.parse(await e.target.files[0].text());if(!Array.isArray(rows))throw Error('File does not contain an invoice list');await importInvoices(rows);await refresh();toast(`Imported ${rows.length} invoices`);await renderSettings();}catch(err){toast(`Import failed: ${err.message}`,'error');}};document.querySelector('#pdf-folder').onchange=async e=>{const status=document.querySelector('#pdf-status');try{status.textContent='Matching original PDFs…';const result=await importOriginalPdfFiles(e.target.files,await allInvoices());status.textContent=`${result.matches.length} original PDFs matched and will replace generated Drive copies on the next sync. ${result.unmatched.length} invoices are still missing an original PDF.`;}catch(err){status.textContent=`PDF import failed: ${err.message}`;}};}

async function runSync(){const button=document.activeElement;const old=button?.textContent;if(button?.tagName==='BUTTON'){button.disabled=true;button.textContent='Connecting…';}try{const result=await syncDrive(message=>{if(button?.tagName==='BUTTON')button.textContent=message;});toast(`Sync complete: ${result.invoices} invoices${result.missingOriginals.length?`, ${result.missingOriginals.length} PDFs missing`:''}`);await showPage(page);}catch(err){toast(err.message,'error');}finally{if(button?.tagName==='BUTTON'){button.disabled=false;button.textContent=old;}}}

async function bootstrap(){
  try {
    layout();
    const startup = showPage(location.hash.slice(1) || 'dashboard');
    await Promise.race([
      startup,
      new Promise((_, reject) => setTimeout(() => reject(new Error('The local invoice database is taking too long to open.')), 8000))
    ]);
    window.addEventListener('hashchange', () => showPage(location.hash.slice(1) || 'dashboard'));
  } catch(err) {
    console.error(err);
    const main = document.querySelector('#main') || app;
    main.innerHTML=`<section class="page active"><div class="startup-error"><h1>Invoice Manager could not start</h1><p>${esc(err.message)}</p><p>Close every other Invoice Manager tab or installed-app window, then reload this page.</p><button class="btn btn-primary" id="startup-reload">Reload app</button></div></section>`;
    document.querySelector('#startup-reload').onclick = () => location.reload();
  }
}
bootstrap();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
