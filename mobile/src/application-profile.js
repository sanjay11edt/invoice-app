import { recipients } from './email.js';
import { allInvoices, setting, setSetting } from './db.js';
import { clientKey } from './recipients.js';

export function validateProfile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid application profile.');
  if (!data.recipient_presets && !data.sender_profile && !data.email_config) throw Error('No application defaults found in this file.');
  if (data.recipient_presets && (typeof data.recipient_presets !== 'object' || Array.isArray(data.recipient_presets))) throw Error('Invalid recipient presets.');
  const result = { recipient_presets: {} };
  for (const [client, values] of Object.entries(data.recipient_presets || {})) {
    if (!values || typeof values.to !== 'string' || typeof values.cc !== 'string') throw Error('Each recipient preset needs To and CC text.');
    result.recipient_presets[client.trim().toLowerCase()] = { to: recipients(values.to, true), cc: recipients(values.cc) };
  }
  if (data.sender_profile) {
    if (!['sender_name', 'sender_address', 'sender_phone'].every(key => typeof data.sender_profile[key] === 'string')) throw Error('Invalid sender details.');
    result.sender_profile = Object.fromEntries(['sender_name', 'sender_address', 'sender_phone'].map(key => [key, data.sender_profile[key]]));
  }
  if (data.email_config) {
    if (!['default_subject', 'default_body'].every(key => typeof data.email_config[key] === 'string')) throw Error('Invalid email templates.');
    result.email_config = { default_subject: data.email_config.default_subject, default_body: data.email_config.default_body };
  }
  return result;
}

export async function importApplicationProfile(data) {
  const profile = validateProfile(data);
  const presets = { ...await setting('recipient_presets', {}), ...profile.recipient_presets };
  await setSetting('recipient_presets', presets);
  // Update saved composer preferences too, including an intentionally empty CC.
  for (const row of await allInvoices()) {
    const preset = profile.recipient_presets[clientKey(row)];
    if (preset) await setSetting(`email_recipients:${row.client || row.billing_name}`, preset);
  }
  if (profile.sender_profile) await setSetting('sender_profile', profile.sender_profile);
  if (profile.email_config) await setSetting('email_config', profile.email_config);
}
