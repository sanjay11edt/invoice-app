import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyItems, newInvoiceDefaults } from '../src/invoice-defaults.js';

test('new invoice uses latest client and two completed months without copying hours or identity', () => {
  const rows = [{id:'old', date:'2026-06-01', client:'Old'}, {id:'latest', date:'2026-08-01', client:'Example', billing_name:'Example Co', items:[{description:'Development',rate:1200,hours:100,amount:120000},{description:'Cursor AI Subscription',rate:2000,hours:'-',amount:2000}]}];
  const draft=newInvoiceDefaults(rows,new Date(2026,9,1));
  assert.equal(draft.client,'Example');
  assert.equal(draft.billing_name,'Example Co');
  assert.equal(draft.id,undefined);
  assert.equal(draft.invoice_month,'2026-08');
  assert.equal(draft.items.length,4);
  assert.equal(draft.items[0].period,'01-Aug-2026 to 31-Aug-2026');
  assert.equal(draft.items[1].period,'01-Sep-2026 to 30-Sep-2026');
  assert.equal(draft.items[0].hours,'');
  assert.equal(draft.items[0].rate,1200);
  assert.equal(draft.items[2].hours,'-');
  assert.equal(draft.items.reduce((sum,x)=>sum+Number(x.amount),0),4000);
});

test('year rollover, leap years, and invoice number collisions', () => {
  const draft=newInvoiceDefaults([{invoice_number:'2026-01'},{invoice_number:'2026-01-2'}],new Date(2026,0,1));
  assert.equal(draft.start,'2025-11');
  assert.equal(draft.end,'2025-12');
  assert.equal(draft.invoice_number,'2026-01-3');
  assert.equal(monthlyItems('2024-02','2024-02')[0].period,'01-Feb-2024 to 29-Feb-2024');
  assert.throws(()=>monthlyItems('2026-09','2026-08'));
  assert.throws(()=>monthlyItems('2026-13','2026-13'));
});

test('empty history does not invent client or bank details and deleted records are excluded', () => {
  const draft=newInvoiceDefaults([{client:'Deleted',deleted_at:'2026-09-01'}],new Date(2026,9,1));
  assert.equal(draft.client,'');
  assert.equal(draft.account_number,'');
  assert.equal(draft.items.length,4);
});
