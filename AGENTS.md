# Repository instructions

Read `CONSTITUTION.md` before modifying this application. It is the product's preservation contract, explicitly requested by the user on 2026-10-01.

- Treat this as one application. Preserve existing workflows, details, defaults, appearance, calculations, and actions across devices.
- A narrow fix is not permission to redesign, replace, remove, or simplify neighboring functionality. Later explicit user instructions override the baseline only within their stated scope.
- Read the affected original implementation and the constitution's parity register before editing. Do not use the latest incomplete implementation as the sole specification.
- Preserve private recipient, client, sender, and bank defaults through private configuration and migrations. Do not replace existing populated defaults with empty fields or require a successful send to save recipients.
- Never commit private profiles, contact details, invoice records, PDF exports, bank values, OAuth secrets, or tokens. See ignored `PRIVATE_BASELINE.md` for exact local baseline values and the prepared import profile.
- If baseline source files or private configuration are unavailable, report that limitation. Do not invent values or silently substitute a different workflow.
- Verify the complete affected user journey, including adjacent existing actions. Test attachments and recipient population when touching email; render and inspect PDFs when touching layout. Deployment must pass `npm test` and `npm run build` in `mobile`.
- Do not send a real invoice as a test. Test transport with mocks unless the user explicitly authorizes a recipient and message.
- Fixes that restore the baseline can proceed within the user's authorization. Do not add repeated permission requests for routine implementation choices.
- Update the parity register honestly. A passing build or a visible button is not proof of working sign-in, delivery, synchronization, or existing-data migration.
- Report exactly what changed, what was tested, what was published, and any one-time migration still required. Do not claim a private profile has been applied to a browser you cannot access.
