# Invoice Manager Mobile

Installable, offline-first invoice app. Invoice records are stored in the browser's IndexedDB database. Pressing **Sync** merges records through Google Drive and uploads current PDFs into visible Drive folders.

## Google Drive setup

1. Create or select a project in Google Cloud Console.
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen and add your Google account as a test user if the app remains in testing.
4. Create an OAuth 2.0 Client ID of type **Web application**.
5. Add the app's final HTTPS address under **Authorized JavaScript origins**.
6. In the installed Invoice Manager, open Settings and paste the Client ID. Do not paste or publish a client secret.

The app requests only `drive.file`, so it can manage files it creates without gaining general access to all Drive files.

## Drive layout

```text
Invoice App/
├── Data/invoices-sync.json
└── Invoices/<year>/<month>/Invoice #<number> <account>.pdf
```

## Local development

```powershell
npm install
npm run dev
```

Production build:

```powershell
npm run build
```

The generated `dist` directory can be published on any static HTTPS host. HTTPS is required for installation, service workers, and Google authorization (localhost is allowed during development).

The repository includes a GitHub Pages workflow for free HTTPS publishing. Before publishing the repository, verify that `.gitignore` continues to exclude invoice data, OAuth tokens, email settings, logs, and generated PDFs.

Existing invoice data is deliberately not included in the published application bundle. On the desktop, use **Settings → Import desktop invoices** to select `invoices_data.json`, then press **Sync**. Install/open the app on the phone and press **Sync** using the same Google account.

## Synchronization rules

- Each record has a stable ID and `updated_at` timestamp.
- The newest copy of a record wins during a merge.
- Deletions are synchronized as tombstones, preventing old devices from restoring deleted invoices.
- PDFs are uploaded again only when their invoice changes.
- Deleting an invoice does not automatically delete its Drive PDF.

## Invoice format and sender details

Invoice previews, PDF downloads, and Drive PDF uploads use the same reusable invoice layout, including existing records. The From, Bill To, and Bank Details blocks share the height of the tallest block. Previously imported PDF originals remain stored locally as reference copies.

Set the sender name, address, and phone in Settings > Sender details, or import a JSON file containing `sender_name`, `sender_address`, and `sender_phone`. These private details are saved locally and included in invoice records during manual Drive sync. Existing invoice-specific sender details take precedence; the saved profile fills missing fields. No personal address or phone is bundled into the public application.

## Sending invoices

Use **Send Invoice** in an invoice preview, or **Save & Email** on the form. The composer includes To, CC, subject, message, and the current-format PDF attachment. Connecting Gmail does not send anything; the explicit Send Invoice action sends the reviewed message. To and CC defaults are stored per client. Save them before the first send using Save To / CC Defaults or Settings > Invoice Email > Save Recipient Defaults.

Enable the Gmail API in the Google Cloud project used for the existing Web OAuth Client ID, and include Gmail send permission in its OAuth consent configuration. Gmail connection requests `gmail.send` and email address access; tokens stay in memory. Desktop Flask OAuth tokens and app passwords do not transfer to GitHub Pages. If Gmail is unavailable, **Download Email Draft** exports an unsent `.eml` with the PDF attached for a compatible mail application.

Implementation follows the [Gmail sending API](https://developers.google.com/workspace/gmail/api/guides/sending) and [Google Identity token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

## Preservation contract and private defaults

Read `../CONSTITUTION.md` and `../AGENTS.md` before changing the application. Original functionality is the baseline; the constitution records protected behavior, approved targeted changes and remaining parity gaps.

Under Settings > Invoice Email > Restore previous application defaults, import the private application profile prepared from the original local configuration. It restores sender details, client-specific recipient presets and email subject/body templates without replacing invoices. Profile contents are not included in the public repository. Recipient fields also travel with invoice data during manual Drive sync.
