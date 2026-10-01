export const clientKey = invoice => String(invoice.client || invoice.billing_name || '').trim().toLowerCase();

// An explicitly saved empty CC is intentional and must not resurrect an old CC.
export function recipientDefaults(invoice, saved, presets = {}) {
  const preset = presets[clientKey(invoice)] || {};
  return {
    to: saved?.to ?? invoice.email_to ?? invoice.billing_email ?? preset.to ?? '',
    cc: saved?.cc ?? invoice.email_cc ?? preset.cc ?? ''
  };
}
