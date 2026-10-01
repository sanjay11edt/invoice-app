import test from 'node:test';
import assert from 'node:assert/strict';
import { senderProfile, withSender } from '../src/sender.js';

test('saved sender profile fills missing details on existing invoices without changing billing', () => {
  const invoice = { account_name: 'Consultant', billing_name: 'Customer', total: 18050, items: [{ amount: 18050 }] };
  const profile = { sender_name: 'Consultant', sender_address: '123 Example Street', sender_phone: '123456789' };
  const rendered = withSender(invoice, profile);
  assert.equal(rendered.sender_address, profile.sender_address);
  assert.equal(rendered.sender_phone, profile.sender_phone);
  assert.equal(rendered.billing_name, 'Customer');
  assert.equal(rendered.total, 18050);
  assert.deepEqual(rendered.items, invoice.items);
  assert.equal(invoice.sender_address, undefined);
});

test('invoice-specific sender details take precedence over defaults', () => {
  const row = withSender({ sender_name: 'Original', sender_address: 'Original address' }, { sender_name: 'Default', sender_address: 'New address', sender_phone: '123' });
  assert.equal(row.sender_name, 'Original');
  assert.equal(row.sender_address, 'Original address');
  assert.equal(row.sender_phone, '123');
});

test('sender profile recovers from synced invoices and ignores deleted entries', () => {
  const rows = [{ date: '2026-10-01', sender_address: 'Current address' }, { date: '2026-09-01', sender_phone: '123' }, { date: '2026-11-01', sender_address: 'Deleted', deleted_at: '2026-11-02' }];
  assert.deepEqual(senderProfile(rows, { sender_name: 'Saved name' }), { sender_name: 'Saved name', sender_address: 'Current address', sender_phone: '123' });
});
