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
