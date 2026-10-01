import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { clientKey, recipientDefaults } from '../src/recipients.js';
import { validateProfile, importApplicationProfile } from '../src/application-profile.js';
import { putInvoice, getInvoice, setting } from '../src/db.js';

const preset = { to: 'primary@example.com, billing@example.com', cc: 'copy@example.com, accounts@example.com' };

test('first-open composer populates all previous To and CC recipients before any send', () => {
  assert.deepEqual(recipientDefaults({ client: 'Example Client' }, null, { 'example client': preset }), preset);
});

test('recipient defaults are isolated by client and normalize case/whitespace', () => {
  assert.equal(clientKey({ client: ' Example Client ' }), 'example client');
  assert.deepEqual(recipientDefaults({ client: 'Other' }, null, { 'example client': preset }), { to: '', cc: '' });
});

test('saved preferences and intentionally empty CC override fallback values', () => {
  assert.deepEqual(recipientDefaults({ client: 'Example Client', email_to: 'old@example.com', email_cc: 'old-copy@example.com' }, { to: 'new@example.com', cc: '' }, { 'example client': preset }), { to: 'new@example.com', cc: '' });
  assert.equal(recipientDefaults({ email_to: 'synced@example.com', email_cc: '' }, null).cc, '');
});

test('private profile import restores defaults without altering invoice financial data', async () => {
  const row = { id: 'profile-test', client: 'Example Client', total: 18050, items: [{ amount: 18050 }] };
  await putInvoice(row);
  const profile = { recipient_presets: { 'Example Client': preset }, sender_profile: { sender_name: 'Example Sender', sender_address: '123 Example Road', sender_phone: '1234567890' }, email_config: { default_subject: 'Invoice {month}', default_body: 'Dear Professional' } };
  await importApplicationProfile(profile);
  assert.deepEqual(await setting('email_recipients:Example Client'), preset);
  assert.deepEqual(await setting('recipient_presets'), { 'example client': preset });
  assert.deepEqual(await setting('sender_profile'), profile.sender_profile);
  assert.deepEqual(await setting('email_config'), profile.email_config);
  assert.deepEqual(await getInvoice(row.id), row);
});

test('invalid private profiles fail validation and do not leak credential fields', () => {
  assert.throws(() => validateProfile({}));
  assert.throws(() => validateProfile({ recipient_presets: [] }));
  assert.throws(() => validateProfile({ recipient_presets: { client: { to: 'invalid', cc: '' } } }));
  const result = validateProfile({ recipient_presets: { client: preset }, gmail_app_password: 'do-not-import', token: 'do-not-import' });
  assert.equal(result.gmail_app_password, undefined);
  assert.equal(result.token, undefined);
});
