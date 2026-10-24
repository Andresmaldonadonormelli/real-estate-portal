type LabeledTransaction = { payee_source?: string | null; description?: string | null };

export function looksLikeBankDescriptor(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/\b(ach|pos|debit|autopay|auto-pay|auto pay|chk|checkcard|sq \*|tst\*|paypal|visa|mastercard|withdrawal|orig co|ppd|web id|trace)\b/i.test(text)) return true;
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 10 && letters === letters.toUpperCase()) return true;
  if (/\d{5,}/.test(text)) return true;
  return false;
}

export function trimRailNoise(value: string) {
  return value.replace(/\b(?:ppd|ach|pos|web|id|trace|chk|checkcard|debit|autopay)\b[:#\s-]*/gi, ' ').replace(/\b\d{5,}\b/g, ' ').replace(/[^A-Za-z0-9&.' -]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function readableName(value: string) {
  if (value !== value.toUpperCase()) return value;
  return value.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

/** Best available name for a ledger row. Empty only when the bank sent no name at all. */
export function transactionDisplayName(tx: LabeledTransaction) {
  const payee = (tx.payee_source || '').trim();
  const description = (tx.description || '').trim();
  if (payee && !looksLikeBankDescriptor(payee)) return payee;
  const trimmed = trimRailNoise(description);
  if (trimmed && trimmed.length > 2 && !looksLikeBankDescriptor(trimmed)) return readableName(trimmed);
  if (description && !looksLikeBankDescriptor(description)) return description;
  for (const value of [description, payee]) {
    const cleaned = trimRailNoise(value);
    if (cleaned.length > 2) return cleaned;
  }
  return description || payee;
}
