import { allInvoices, getOriginalPdf, putInvoice, setting, setSetting } from './db.js';
import { invoicePdf, pdfFilename } from './pdf.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
let token = '';

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = resolve; script.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(script);
  });
}

export async function authorize() {
  const clientId = await setting('google_client_id');
  if (!clientId) throw new Error('Add your Google OAuth Client ID in Settings first.');
  await loadGoogleIdentity();
  token = await new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: response => response.error ? reject(new Error(response.error)) : resolve(response.access_token)
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function drive(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error?.message || 'Google Drive request failed');
  return response.status === 204 ? null : response.json();
}

const escapeQuery = value => String(value).replace(/'/g, "\\'");
async function find(name, parentId, mimeType) {
  const clauses = [`name='${escapeQuery(name)}'`, 'trashed=false'];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  if (mimeType) clauses.push(`mimeType='${mimeType}'`);
  const result = await drive(`/files?q=${encodeURIComponent(clauses.join(' and '))}&fields=files(id,name,modifiedTime)`);
  return result.files?.[0] || null;
}

async function folder(name, parentId) {
  const mime = 'application/vnd.google-apps.folder';
  const existing = await find(name, parentId, mime);
  if (existing) return existing.id;
  const created = await drive('/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: mime, parents: parentId ? [parentId] : undefined }) });
  return created.id;
}

async function upload(name, parentId, blob, fileId = '') {
  const boundary = `invoice_${Date.now()}`;
  const metadata = JSON.stringify({ name, ...(parentId && !fileId ? { parents: [parentId] } : {}) });
  const body = new Blob([`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`, blob, `\r\n--${boundary}--`]);
  const uploadUrl = fileId ? `${UPLOAD}/${encodeURIComponent(fileId)}` : UPLOAD;
  const response = await fetch(`${uploadUrl}?uploadType=multipart&fields=id,modifiedTime,webViewLink`, {
    method: fileId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error?.message || `Upload failed (${response.status})`);
  return response.json();
}

async function fileExists(fileId) {
  if (!fileId) return false;
  const response = await fetch(`${API}/files/${encodeURIComponent(fileId)}?fields=id,trashed`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error?.message || 'Could not verify a Google Drive PDF');
  const file = await response.json();
  return Boolean(file.id && !file.trashed);
}

function merge(local, remote) {
  const rows = new Map();
  [...remote, ...local].forEach(row => {
    const current = rows.get(row.id);
    if (!current || String(row.updated_at) > String(current.updated_at)) rows.set(row.id, row);
  });
  return [...rows.values()];
}

export async function syncDrive(onProgress = () => {}) {
  await authorize();
  onProgress('Opening Invoice App folder…');
  const root = await folder('Invoice App');
  const dataFolder = await folder('Data', root);
  const invoicesFolder = await folder('Invoices', root);
  const syncName = 'invoices-sync.json';
  const syncFile = await find(syncName, dataFolder);
  let remote = [];
  if (syncFile) {
    const response = await fetch(`${API}/files/${syncFile.id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) remote = await response.json();
  }
  const merged = merge(await allInvoices(true), remote);
  for (const row of merged) await putInvoice(row);
  const active = merged.filter(row => !row.deleted_at);
  const missingOriginals = [];
  let uploadedPdfs = 0;
  let reusedPdfs = 0;
  for (let index = 0; index < active.length; index++) {
    const invoice = active[index];
    if (invoice.drive_pdf_id) {
      onProgress(`Verifying PDF ${index + 1} of ${active.length}…`);
      if (await fileExists(invoice.drive_pdf_id)) {
        if (invoice.drive_pdf_updated_at === invoice.updated_at) {
          reusedPdfs++;
          continue;
        }
      } else {
        invoice.drive_pdf_id = '';
        invoice.drive_pdf_url = '';
        invoice.drive_pdf_updated_at = null;
      }
    }
    const original = await getOriginalPdf(invoice.id);
    const isHistorical = invoice.source === 'legacy' || String(invoice.id).startsWith('legacy-');
    if (!original && isHistorical) {
      missingOriginals.push(invoice.id);
      continue;
    }
    onProgress(`Uploading PDF ${index + 1} of ${active.length}…`);
    const [year, month = '01'] = String(invoice.invoice_month || invoice.date || '').split('-');
    const yearFolder = await folder(year || 'Unknown', invoicesFolder);
    const monthFolder = await folder(new Date(Number(year) || 2000, Number(month) - 1, 1).toLocaleString('en', { month: 'long' }), yearFolder);
    const pdfBlob = original?.blob || invoicePdf(invoice);
    const name = original?.name || pdfFilename(invoice);
    const result = await upload(name, monthFolder, pdfBlob, invoice.drive_pdf_id);
    invoice.drive_pdf_id = result.id;
    invoice.drive_pdf_url = result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;
    invoice.drive_pdf_updated_at = invoice.updated_at;
    await putInvoice(invoice);
    uploadedPdfs++;
  }
  const finalRows = await allInvoices(true);
  const dataBlob = new Blob([JSON.stringify(finalRows, null, 2)], { type: 'application/json' });
  await upload(syncName, dataFolder, dataBlob, syncFile?.id);
  const completed = new Date().toISOString(); await setSetting('last_sync', completed);
  return { invoices: finalRows.filter(row => !row.deleted_at).length, completed, missingOriginals, uploadedPdfs, reusedPdfs };
}
