import { clientKey, recipientDefaults } from './recipients.js';
import { importApplicationProfile } from './application-profile.js';
import { allInvoices, setting, setSetting } from './db.js';
import { loadGoogleIdentity } from './drive.js';
import { pdfFilename } from './pdf.js';
import { defaultSubject, defaultBody, emailDefaults, invoiceEmail, recipients, sendInvoiceEmail } from './email.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const scope = 'https://www.googleapis.com/auth/gmail.send email';

export async function openEmailComposer(invoice) {
  document.querySelector('#email-overlay')?.remove();
  const config = await setting('email_config', {});
  const previous = recipientDefaults(invoice, await setting(`email_recipients:${invoice.client || invoice.billing_name}`, null), await setting('recipient_presets', {}));
  const defaults = emailDefaults(invoice, config);
  const overlay = document.createElement('div');
  overlay.id = 'email-overlay'; overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="email-title"><div class="modal-header"><div><h2 id="email-title">Send Invoice #${esc(invoice.invoice_number)}</h2><p class="modal-sub">PDF attached: ${esc(pdfFilename(invoice))}</p></div><button class="btn-icon" id="email-close" aria-label="Close email">×</button></div><div class="modal-body"><form id="email-form"><div class="field"><label for="email-to">To</label><input id="email-to" type="email" multiple required value="${esc(previous.to)}" placeholder="client@example.com"></div><div class="field"><label for="email-cc">CC</label><input id="email-cc" type="email" multiple value="${esc(previous.cc)}" placeholder="Optional; separate addresses with commas"></div><div class="field"><label for="email-subject">Subject</label><input id="email-subject" required value="${esc(defaults.subject)}"></div><div class="field"><label for="email-body">Message</label><textarea id="email-body" rows="8" required>${esc(defaults.body)}</textarea></div><p id="email-status" role="status" class="setting-help">Loading Gmail sign-in…</p><div class="form-actions"><button type="button" class="btn btn-outline" id="email-connect" disabled>Connect Gmail</button><button type="submit" class="btn btn-primary" id="email-send" disabled>Send Invoice</button><button type="button" class="btn btn-outline" id="email-save-recipients">Save To / CC Defaults</button><button type="button" class="btn btn-outline" id="email-draft">Download Email Draft</button></div></form></div></div>`;
  document.body.appendChild(overlay);
  const get = id => overlay.querySelector(`#${id}`);
  let token = '', senderEmail = '', expiresAt = 0, sending = false;
  const close = () => { if (!sending) overlay.remove(); };
  get('email-close').onclick = close;
  overlay.onclick = event => { if (event.target === overlay) close(); };
  const values = () => ({ to: get('email-to').value.trim(), cc: get('email-cc').value.trim(), subject: get('email-subject').value.trim(), body: get('email-body').value, from: senderEmail });
  const remember = async data => {
    const preset={to:recipients(data.to,true),cc:recipients(data.cc)};
    await setSetting(`email_recipients:${invoice.client || invoice.billing_name}`,preset);
    await setSetting('recipient_presets',{...await setting('recipient_presets',{}),[clientKey(invoice)]:preset});
  };
  get('email-save-recipients').onclick=async()=>{try{await remember(values());get('email-status').textContent='To and CC defaults saved for this client. No email was sent.';}catch(error){get('email-status').textContent=error.message;}};
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
    ['email-send', 'email-connect', 'email-draft', 'email-save-recipients', 'email-close'].forEach(id => get(id).disabled = true);
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
      sending = false; get('email-save-recipients').disabled = false; get('email-close').disabled = false; get('email-draft').disabled = false;
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
  const invoices = await allInvoices();
  const clients = [...new Set(invoices.map(row=>row.client || row.billing_name).filter(Boolean))];
  const section = document.createElement('div'); section.className = 'form-section';
  section.innerHTML = `<h3 class="form-section-title">Invoice Email</h3><div class="field"><label for="import-application-profile">Restore previous application defaults</label><input id="import-application-profile" type="file" accept=".json,application/json"></div><p class="setting-help">Import your private application profile to restore To/CC, sender details, and email templates together.</p><div class="field"><label for="recipient-client">Client recipient defaults</label><select id="recipient-client" class="filter-select"><option value="">Select client</option>${clients.map(client=>`<option value="${esc(client)}">${esc(client)}</option>`).join('')}</select></div><div class="field"><label for="recipient-to">Default To</label><input id="recipient-to" type="email" multiple></div><div class="field"><label for="recipient-cc">Default CC</label><input id="recipient-cc" type="email" multiple></div><button class="btn btn-outline" id="save-recipient-defaults">Save Recipient Defaults</button><p class="setting-help">Send Invoice is available on saved invoices. New invoices also have Save &amp; Email. Connect your Gmail account in the email composer using the Google Client ID above.</p><div class="field"><label for="email-default-subject">Default Subject</label><input id="email-default-subject" value="${esc(config.default_subject || defaultSubject)}"></div><div class="field"><label for="email-default-body">Default Message</label><textarea id="email-default-body" rows="8">${esc(config.default_body || defaultBody)}</textarea></div><p class="setting-help">Placeholders: {invoice_number}, {period}, {sender_name}, {billing_name}. To and CC are saved separately for each client and prefilled before sending.</p><button class="btn btn-primary" id="save-email-settings">Save Email Settings</button><p id="email-settings-status" role="status"></p>`;
  container.appendChild(section);
  section.querySelector('#import-application-profile').onchange=async event=>{
    try{const file=event.target.files[0];if(!file)return;await importApplicationProfile(JSON.parse(await file.text()));location.reload();}
    catch(error){section.querySelector('#email-settings-status').textContent=error.message;}
  };
  section.querySelector('#recipient-client').onchange=async event=>{
    const invoice=invoices.find(row=>(row.client || row.billing_name)===event.target.value)||{};
    const preset=recipientDefaults(invoice,await setting(`email_recipients:${event.target.value}`,null),await setting('recipient_presets',{}));
    section.querySelector('#recipient-to').value=preset.to;section.querySelector('#recipient-cc').value=preset.cc;
  };
  section.querySelector('#save-recipient-defaults').onclick=async()=>{
    try{const client=section.querySelector('#recipient-client').value;if(!client)throw Error('Select a client.');
      const preset={to:recipients(section.querySelector('#recipient-to').value,true),cc:recipients(section.querySelector('#recipient-cc').value)};
      await setSetting(`email_recipients:${client}`,preset);await setSetting('recipient_presets',{...await setting('recipient_presets',{}),[clientKey({client})]:preset});
      section.querySelector('#email-settings-status').textContent='Recipient defaults saved. No email was sent.';
    }catch(error){section.querySelector('#email-settings-status').textContent=error.message;}
  };
  section.querySelector('#save-email-settings').onclick = async () => {
    await setSetting('email_config', { default_subject: section.querySelector('#email-default-subject').value, default_body: section.querySelector('#email-default-body').value });
    section.querySelector('#email-settings-status').textContent = 'Email settings saved.';
  };
}
