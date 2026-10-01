import { setting, setSetting } from './db.js';
import { loadGoogleIdentity } from './drive.js';
import { pdfFilename } from './pdf.js';
import { defaultSubject, defaultBody, emailDefaults, invoiceEmail, sendInvoiceEmail } from './email.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const scope = 'https://www.googleapis.com/auth/gmail.send email';

export async function openEmailComposer(invoice) {
  document.querySelector('#email-overlay')?.remove();
  const config = await setting('email_config', {});
  const previous = await setting(`email_recipients:${invoice.client || invoice.billing_name}`, {});
  const defaults = emailDefaults(invoice, config);
  const overlay = document.createElement('div');
  overlay.id = 'email-overlay'; overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="email-title"><div class="modal-header"><div><h2 id="email-title">Send Invoice #${esc(invoice.invoice_number)}</h2><p class="modal-sub">PDF attached: ${esc(pdfFilename(invoice))}</p></div><button class="btn-icon" id="email-close" aria-label="Close email">×</button></div><div class="modal-body"><form id="email-form"><div class="field"><label for="email-to">To</label><input id="email-to" type="email" multiple required value="${esc(previous.to || invoice.billing_email || '')}" placeholder="client@example.com"></div><div class="field"><label for="email-cc">CC</label><input id="email-cc" type="email" multiple value="${esc(previous.cc || '')}" placeholder="Optional; separate addresses with commas"></div><div class="field"><label for="email-subject">Subject</label><input id="email-subject" required value="${esc(defaults.subject)}"></div><div class="field"><label for="email-body">Message</label><textarea id="email-body" rows="8" required>${esc(defaults.body)}</textarea></div><p id="email-status" role="status" class="setting-help">Loading Gmail sign-in…</p><div class="form-actions"><button type="button" class="btn btn-outline" id="email-connect" disabled>Connect Gmail</button><button type="submit" class="btn btn-primary" id="email-send" disabled>Send Invoice</button><button type="button" class="btn btn-outline" id="email-draft">Download Email Draft</button></div></form></div></div>`;
  document.body.appendChild(overlay);
  const get = id => overlay.querySelector(`#${id}`);
  let token = '', senderEmail = '', expiresAt = 0, sending = false;
  const close = () => { if (!sending) overlay.remove(); };
  get('email-close').onclick = close;
  overlay.onclick = event => { if (event.target === overlay) close(); };
  const values = () => ({ to: get('email-to').value.trim(), cc: get('email-cc').value.trim(), subject: get('email-subject').value.trim(), body: get('email-body').value, from: senderEmail });
  const remember = async data => setSetting(`email_recipients:${invoice.client || invoice.billing_name}`, { to: data.to, cc: data.cc });
  get('email-draft').onclick = async () => {
    if (!get('email-form').reportValidity()) return;
    try {
      const data = values(), { mime } = await invoiceEmail(invoice, data);
      const url = URL.createObjectURL(new Blob(['X-Unsent: 1\r\n', mime], { type: 'message/rfc822' }));
      const link = document.createElement('a'); link.href = url; link.download = pdfFilename(invoice).replace(/\.pdf$/, '.eml'); link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      get('email-status').textContent = 'Email draft downloaded with PDF attached. Open it in a compatible email app to send; it has not been sent.';
    } catch (error) { get('email-status').textContent = error.message; }
  };
  get('email-form').onsubmit = async event => {
    event.preventDefault();
    if (sending || !get('email-form').reportValidity()) return;
    if (!token || Date.now() >= expiresAt) { get('email-status').textContent = 'Connect Gmail before sending.'; get('email-send').disabled = true; return; }
    sending = true;
    ['email-send', 'email-connect', 'email-draft', 'email-close'].forEach(id => get(id).disabled = true);
    get('email-status').textContent = 'Sending invoice with PDF attached…';
    let delivered = false;
    try {
      const data = values(), { raw } = await invoiceEmail(invoice, data);
      await sendInvoiceEmail(token, raw);
      delivered = true;
      get('email-status').textContent = `Invoice sent from ${senderEmail} to ${data.to}.`;
      get('email-send').textContent = 'Sent';
      try { await remember(data); } catch { /* A local preferences error must not encourage duplicate delivery. */ }
    } catch (error) { get('email-status').textContent = error.message; }
    finally {
      sending = false; get('email-close').disabled = false; get('email-draft').disabled = false;
      get('email-connect').disabled = delivered; get('email-send').disabled = delivered;
    }
  };
  get('email-to').focus();
  try {
    const clientId = await setting('google_client_id');
    if (!clientId) throw Error('Add your Google OAuth Client ID in Settings to send with Gmail. You can also download an email draft with the PDF attached.');
    await loadGoogleIdentity();
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope,
      callback: async response => {
        get('email-connect').disabled = false;
        if (response.error) { get('email-status').textContent = `Gmail connection failed: ${response.error_description || response.error}`; return; }
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, 'https://www.googleapis.com/auth/gmail.send')) { get('email-status').textContent = 'Gmail sending permission was not granted. Connect again and allow sending.'; return; }
        try {
          const identity = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${response.access_token}` } });
          const user = await identity.json();
          if (!identity.ok || !user.email) throw Error('Could not identify the sending account. Reconnect and allow email address access.');
          token = response.access_token; senderEmail = user.email; expiresAt = Date.now() + Math.max(0, Number(response.expires_in) - 30) * 1000;
          get('email-status').textContent = `Ready to send from ${senderEmail}. Review the message, then click Send Invoice.`;
          get('email-send').disabled = false;
        } catch (error) { get('email-status').textContent = error.message; }
      },
      error_callback: error => { get('email-connect').disabled = false; get('email-status').textContent = error.type === 'popup_closed' ? 'Google sign-in was closed. No email was sent.' : 'Google sign-in could not open. Allow popups, then connect again.'; }
    });
    get('email-connect').disabled = false;
    get('email-status').textContent = 'Connect Gmail, then review and send. No email is sent when you connect.';
    get('email-connect').onclick = () => { token = ''; get('email-send').disabled = true; get('email-connect').disabled = true; get('email-status').textContent = 'Connecting Gmail…'; client.requestAccessToken({ prompt: 'select_account' }); };
  } catch (error) { get('email-status').textContent = error.message; }
}

export async function mountEmailSettings(container) {
  const config = await setting('email_config', {});
  const section = document.createElement('div'); section.className = 'form-section';
  section.innerHTML = `<h3 class="form-section-title">Invoice Email</h3><p class="setting-help">Send Invoice is available on saved invoices. New invoices also have Save &amp; Email. Connect your Gmail account in the email composer using the Google Client ID above.</p><div class="field"><label for="email-default-subject">Default Subject</label><input id="email-default-subject" value="${esc(config.default_subject || defaultSubject)}"></div><div class="field"><label for="email-default-body">Default Message</label><textarea id="email-default-body" rows="8">${esc(config.default_body || defaultBody)}</textarea></div><p class="setting-help">Placeholders: {invoice_number}, {period}, {sender_name}, {billing_name}. Recipients are remembered separately for each client after a successful send.</p><button class="btn btn-primary" id="save-email-settings">Save Email Settings</button><p id="email-settings-status" role="status"></p>`;
  container.appendChild(section);
  section.querySelector('#save-email-settings').onclick = async () => {
    await setSetting('email_config', { default_subject: section.querySelector('#email-default-subject').value, default_body: section.querySelector('#email-default-body').value });
    section.querySelector('#email-settings-status').textContent = 'Email settings saved.';
  };
}
