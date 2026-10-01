# Invoice App Constitution

Established: 2026-10-01, at the user's explicit request to preserve the previous implementation and stop regressions.

## 1. Governing rule

This is one invoice application. All established features, populated details, workflows, visual conventions, and defaults are part of its contract. Preserve them unless the user explicitly requests a specific change. A request to fix one issue does not authorize redesigning other areas, removing controls, changing financial data, blanking defaults, or replacing a working workflow with a manual workaround.

The original implementation is the reference, not an incomplete port or the latest deployed snapshot. Existing defects must not become specifications simply because they are already deployed. Known gaps below remain restoration work, not approved deviations.

Priority: current explicit user instruction; this constitution and its recorded approved changes; original behavior and private baseline; implementation convenience. Later user changes amend only the relevant scope. Routine repairs do not require repeated approval.

## 2. Sources of truth

| Area | Original reference | Current implementation |
|---|---|---|
| Navigation, forms, labels and actions | `templates/index.html` | `mobile/src/app.js`, `mobile/src/email-ui.js` |
| Defaults, calculations, filters and email composer | `static/app.js` | `invoice-defaults.js`, `app.js`, `email.js`, `recipients.js` under `mobile/src/` |
| PDF layout and currency formatting | `pdf_gen.py` and previous saved invoices | `mobile/src/pdf.js` |
| Save, edit, email delivery and file naming | `app.py` | `mobile/src/db.js`, `email.js`, `drive.js` |
| Established visual design | `static/style.css` | Same shared stylesheet plus responsive adaptations |
| Exact client, sender, bank and recipient values | Private original configuration and invoices | Private imported profile, settings and invoice records |

Original Python, template, JavaScript, and private data files are intentionally excluded from the public repository. Their absence in a clean clone does not authorize guessing. `PRIVATE_BASELINE.md` records exact locally verified values, without passwords or tokens. Public tests use synthetic data.

## 3. Product and interface invariants

- Keep Dashboard, All Invoices, New Invoice, and Settings, active navigation, reset/cancel, edit, PDF download, Send Invoice/Email, and Save & Email.
- Preserve established visual styling and useful desktop information while adapting layout for touch and smaller screens. Do not introduce a simplified replacement interface.
- A backend, framework, device, or deployment change is invisible implementation work, not permission to drop capabilities or ask the user to manage separate products.
- Keep form labels, required fields, error/status messages, loading states, and visible success feedback. Never report success until the corresponding operation succeeded.
- Preserve in-progress input when validation or network requests fail. Do not overwrite edited invoices with new-invoice defaults.

## 4. Invoice creation and editing

- Invoice fields: number, date, derived invoice month, client preset, billed-to name, address and phone; sender name, full address and phone; bank, account holder, account number and IFSC; line items and total.
- Selecting the established default client must prefill its existing details. Selecting another client must use that client's details. A blank or generic client is not an acceptable replacement for configured data.
- Sender and bank information must persist and appear in generated output. Keep private configuration outside public bundles.
- Original ordinary-period default: current calendar month with the last day of that month as invoice date. Two-month support is an explicit enhancement; do not silently reinterpret one requested combined invoice as permission to change every future default.
- Original number format: `YYYY-MM`, using alphabetic collision suffixes starting at `-b`. Never introduce duplicate numbers or renumber existing invoices during a format change. The original finite-suffix collision fallback is a defect, not a requirement to duplicate numbers.
- Invoice month derives from the first valid service-period date. Preserve supported date forms and calendar boundaries, leap years, and year rollover. Month/FY reporting must not silently substitute creation time for the billing period.
- Save creates one record. Edit retains its identity and updates that record. Save & Email saves first and opens the email composer for the saved invoice.
- Reset returns a new form with established defaults. Cancel editing does not save changes.

## 5. Line items and calculations

- Keep Description, Period, Rate / Hr, Hours, and Amount columns.
- Preserve the configured development-services description, hourly rate and Cursor AI Subscription line. Exact existing values are in the private baseline.
- For selected multi-month billing, create the requested monthly service and subscription rows in one invoice. Each period spans the correct first and last dates of its month.
- Allow add/remove/edit of rows. Keep Cursor AI subscription rows below service rows, including when adding a new service row.
- Service amount follows rate multiplied by hours. Fixed subscription amounts support `-` for hours and must not become zero or NaN. Clear/reset inputs must not leave stale calculated amounts.
- Do not invent service hours or silently copy historical worked hours into a new invoice. Do not change existing line-item amounts to achieve a desired visual result.
- Original computed amounts were read-only; changes to manual amount editing are a behavior change to track explicitly.
- Preserve total preview, Indian currency grouping, rupee notation, and amount in words. Total must equal the sum of line-item amounts.

## 6. Canonical invoice format

- Use the previous A4 invoice design: inset rounded indigo INVOICE banner, invoice number and formatted date; From, Bill To and Bank Details blocks; dark five-column item header; alternating light item rows; indigo total strip; amount in words; divider and thank-you footer.
- The From block includes the full sender name, street/locality, city/postal code, and phone. Bill To includes name, full address and phone. Bank Details includes bank, account number, IFSC and account holder.
- All three detail blocks have identical height, aligned tops and bottoms, and expand to fit the tallest content. No clipping, overlap, broken rupee glyphs, or accidental HTML/XML artifacts.
- Keep long descriptions/periods legible. Repeat table headers on additional pages; keep ordinary rows intact and the final row with the total where space permits.
- The same invoice data and canonical renderer serve preview, download, email attachment, and manually requested Drive PDF generation. A repaired downloaded file alone does not satisfy a template change.
- Preserve filename convention `Invoice #<number> <account holder>.pdf`, sanitizing invalid filename characters only.
- Formatting must not change invoice number, date, customer, amounts, service periods or hours.
- Preserve imported original PDFs as reference copies. The user explicitly requested the canonical format for existing and new previews/downloads; this does not authorize destroying originals.

## 7. Email contract

- Send Invoice/Email is available for saved invoices; Save & Email remains on the invoice form.
- Opening the composer prepopulates the established client-specific To and CC lists before any send has succeeded. An empty field or "we will remember after sending" is not equivalent.
- Preserve every To and CC address, its role, and intentional empty CC values. Do not apply one client's recipients to unrelated clients.
- To and CC remain editable. Offer explicit Save To / CC Defaults and editable recipient presets in Settings; defaults persist across reopening, reload and manual sync.
- Preserve the previous default subject structure `Invoice {month} :: <sender name>` and original greeting/body, including payment request and sign-off. Substitute invoice-specific values without losing multiple selected periods. Keep configurable subject/body templates.
- Compose includes To, CC, Subject and Message, with an automatic PDF attachment using the canonical invoice format and filename. Support multiple comma-separated addresses and validate them.
- Gmail connection alone does not send. Only the user's explicit Send action sends. No real emails as automated tests; no background/automatic retries that could send twice.
- Preserve Gmail settings and connection capability. Tokens/app passwords from the local implementation cannot be silently treated as browser credentials. If a different delivery implementation requires setup, disclose the exact gap and migrate permissible configuration without exposing credentials.
- Keep existing working server-side OAuth/SMTP support in the local code. Never embed server secrets or app passwords in browser code. Browser Gmail delivery uses authorized Gmail API access.
- Preserve entered recipients/message on errors; distinguish not-sent, confirmed-sent, and unknown delivery status. Confirmed delivery must not become a failure because saving local preferences failed.
- Email draft export is an additional fallback, not a replacement for Send Invoice. The preview PDF, downloaded PDF and attachment use the same data and format.

## 8. Dashboard, browsing and reports

- Preserve invoice count, total billed, client count, current calendar-year total and current Indian financial-year total, plus sidebar summaries.
- Preserve revenue-by-client chart, client value sorting, yearly revenue chart, year sorting, calendar/FY mode, and recent invoices opening their details.
- All Invoices retains search, client, calendar-year and financial-year filters; sortable number, month, client, billed-to, date and amount columns; invoice actions; and empty-state messages.
- Filter summaries retain count, total amount, distinct clients and average, reflecting the filtered set.
- Indian financial year runs April to March. Preserve period-derived reporting and existing date/month fallbacks for historical records.
- Preserve raw invoice data independently of display formatting. Deletion requires an explicit user action and cannot be triggered by a display/filter change.

## 9. Data, sync and privacy

- Keep invoice identities, creation/edit semantics, updated timestamps, original references, Drive IDs/URLs and deletion tombstones. Editing/importing/syncing must not duplicate or resurrect deleted invoices.
- Preserve device-local invoices, offline/PWA availability, deliberate JSON/original-PDF import, and user-triggered Drive synchronization.
- Keep Drive paths `Invoice App/Data/invoices-sync.json` and `Invoice App/Invoices/<year>/<month>/`. Preserve the existing local file convention where that implementation is used.
- Conflict resolution must retain reference metadata. Update synchronization timestamps when changing persisted defaults that travel with invoice records.
- Private profiles migrate sender details, email templates and client recipient presets together without replacing invoice line items or financial data. Never require retyping information available in the original private configuration merely because an implementation was replaced.
- No invoice JSON, customer emails, bank values, sender address/phone, OAuth tokens/secrets, app passwords, generated PDFs, private profile files, or private baseline annex in the public repository or deployed assets.
- Do not erase browser storage, reset settings, clear authentication, delete originals or overwrite private records as a troubleshooting shortcut.
- When browser-local data is inaccessible to the agent, say so and supply the smallest safe one-time migration. Do not pretend it has been installed.

## 10. Approved changes in this conversation

1. Support a single invoice covering the requested two recent months, with client and monthly service/Cursor defaults.
2. Keep the previous invoice PDF design; add equal-height From/Bill To/Bank Details blocks and full sender details to the reusable template.
3. Apply that template to existing/new invoice previews, downloads and generated sync PDFs, retaining original reference copies.
4. Restore Send Invoice and Save & Email, their composer, attachment and settings.
5. Restore the previous To/CC defaults, and establish this preservation constitution.

These are targeted changes. They do not authorize changes to unrelated reporting, numbering, dates, default-client selection or established data values.

## 11. Known parity gaps and verification limits

This register is not an exemption to the constitution. Do not advertise full parity until each item is verified/restored.

| Area | Known state at establishment | Required disposition |
|---|---|---|
| Recipient defaults | Composer lookup, editable presets and private profile import implemented; automated first-open and empty-CC tests pass; private browser import not yet verified | Apply prepared private profile once and verify the actual composer; never claim this migration is already applied |
| Sender details | Original values exist locally; browser requires private profile migration if not already saved | Import once; never publish the private values as code |
| Gmail delivery | Message construction/transport errors covered by mock tests; live delivery not tested | User connects Gmail and authorizes any real send; do not claim live success |
| Number/date defaults | Current web code uses numeric suffixes and today's date rather than original alphabetic suffix/month end | Restore in a focused parity change; preserve existing records |
| Ordinary-period default | Current web code defaults all new invoices to two completed months | Restore ordinary-month semantics without removing explicitly selected multi-month billing |
| Default client | Current web code chooses latest client rather than original preferred client | Preserve preferred-client configuration via private profile, then verify |
| Row insertion/calculated amount | Current web add-row ordering/manual amount behavior differs from original | Restore service-before-Cursor insertion and agreed calculation semantics |
| Form amount-in-words preview | Current form displays generic calculation text; PDF has words | Restore original form preview capability |
| Dashboard chart controls | Current web charts omit original sort and calendar/FY chart controls | Restore controls and validate totals against original calculations |
| Historical date fallback | Current web parsing is less complete than original | Verify and preserve original supported period/path/number fallbacks |
| UI verification | No connected browser was available during this repair | Do not treat code/tests/HTTP asset checks as a completed interactive browser test |

## 12. Change and release procedure

1. Identify the user's requested behavior and affected constitution sections.
2. Read the original implementation and private baseline relevant to it. Record existing behaviors before editing.
3. Make the narrow change; retain adjacent buttons, defaults and routes. Migration needs data preservation, not just similar-looking fields.
4. Run meaningful tests for affected behavior, plus `npm test` and `npm run build` in `mobile`. Deployment runs both and must fail on test/build failures.
5. For PDFs, render and visually inspect representative and long invoices; verify totals and sender/client/bank completeness and equal block heights. For email, verify populated To/CC, templates, attachment bytes, cancellations and failures without unauthorized delivery.
6. Inspect the staged diff for private data. Stage named source files, never a blanket add of generated/private outputs.
7. Publish only within existing user authorization. Check deployment success and served assets; check user workflows in a connected browser when available. Never label a limitation as verified success.
8. Report what changed, what stayed compatible, evidence, and any unapplied private-profile migration. Update this constitution and parity register only with factual changes and explicit user-directed scope.

## 13. Required regression coverage

- First-open To/CC population; persistence before first send; client isolation; explicit cleared CC; private profile validation and import; synced recipient fields.
- Existing invoice values preserved while applying sender defaults and formatting.
- Single/multi-month calendar bounds, leap years, collision handling, service hours and subscription amounts.
- Full PDF content, equal block heights, page breaks, total/words, and matching attachment rendering.
- Send and Save & Email entry points; To/CC validation; UTF-8 message; PDF attachment; no automatic duplicate delivery; honest error status.
- Affected dashboard/report totals and filters whenever that area changes.

## 14. Amendment record

2026-10-01: Initial constitution requested after regressions in recipient defaults, email controls and PDF formatting. It records original behavior, targeted user-approved changes, private-profile requirements, and remaining gaps rather than presenting the incomplete port as the new baseline.
