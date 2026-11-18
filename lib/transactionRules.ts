import { categoryNeedsReview, transactionTypeForCategory, type LedgerFlow } from './accounting.ts';

export type RuleDirection = 'incoming' | 'outgoing';

export type TransactionRule = {
  id: string;
  user_id: string;
  enabled: boolean;
  match_text: string;
  match_direction: RuleDirection;
  match_account_mask: string | null;
  match_property_id: string | null;
  assign_category: string;
  assign_property_id: string | null;
  created_from_transaction_id?: string | null;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
};

export type MatchCandidate = {
  payee_source?: string | null;
  description?: string | null;
  amount: number;
  property_id?: string | null;
  source_account_mask?: string | null;
};

export type RuleDraft = {
  match_text: string;
  match_direction: RuleDirection;
  match_account_mask: string | null;
  match_property_id: string | null;
  assign_category: string;
  assign_property_id: string | null;
};

export type RuleApplication =
  | { status: 'none' }
  | { status: 'match'; rule: TransactionRule; category: string; type: LedgerFlow; needs_review: boolean; property_id: string | null }
  | { status: 'conflict'; rules: TransactionRule[] };

const NOISE = /\b(?:ppd|ach|pos|web|id|trace|chk|checkcard|debit|autopay|auto-pay|auto pay|withdrawal|orig co|visa|mastercard|sq \*|tst\*|paypal)\b[:#\s-]*/gi;

export function normalizeAccountMask(mask?: string | null) {
  const digits = String(mask || '').replace(/\D/g, '');
  return digits || null;
}

export function directionFromAmount(amount: number): RuleDirection {
  return Number(amount) >= 0 ? 'incoming' : 'outgoing';
}

export function normalizeMatchText(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(NOISE, ' ')
    .replace(/[^a-z0-9&.' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prefer a readable payee; otherwise a cleaned bank description fragment. */
export function extractMatchText(candidate: Pick<MatchCandidate, 'payee_source' | 'description'>) {
  const payee = normalizeMatchText(candidate.payee_source);
  if (payee && payee.length >= 2 && !looksLikeNoise(payee)) return payee;
  const description = normalizeMatchText(candidate.description);
  if (description && description.length >= 2) return description;
  return payee || description || '';
}

export function canCreateRuleFrom(candidate: MatchCandidate & { category?: string | null }) {
  const text = extractMatchText(candidate);
  if (!text || text.length < 2) return false;
  const category = String(candidate.category || '').trim();
  if (!category || /needs review|uncategor/i.test(category)) return false;
  return true;
}

export function buildRuleDraftFromTransaction(candidate: MatchCandidate & {
  category: string;
  id?: string | null;
}): RuleDraft | null {
  if (!canCreateRuleFrom(candidate)) return null;
  const match_text = extractMatchText(candidate);
  const match_account_mask = normalizeAccountMask(candidate.source_account_mask);
  const propertyId = candidate.property_id || null;
  return {
    match_text,
    match_direction: directionFromAmount(candidate.amount),
    match_account_mask,
    match_property_id: match_account_mask ? propertyId : propertyId,
    assign_category: candidate.category,
    assign_property_id: propertyId,
  };
}

export function ruleMatches(rule: Pick<TransactionRule, 'enabled' | 'match_text' | 'match_direction' | 'match_account_mask' | 'match_property_id' | 'archived_at'>, candidate: MatchCandidate) {
  if (rule.enabled === false || rule.archived_at) return false;
  const text = normalizeMatchText(rule.match_text);
  if (!text) return false;
  if (directionFromAmount(candidate.amount) !== rule.match_direction) return false;

  const ruleMask = normalizeAccountMask(rule.match_account_mask);
  const candidateMask = normalizeAccountMask(candidate.source_account_mask);
  if (ruleMask) {
    if (!candidateMask || candidateMask !== ruleMask) return false;
  } else if (rule.match_property_id) {
    if (!candidate.property_id || candidate.property_id !== rule.match_property_id) return false;
  }

  const haystack = `${normalizeMatchText(candidate.payee_source)} ${normalizeMatchText(candidate.description)}`.trim();
  if (!haystack) return false;
  return haystack.includes(text);
}

export function matchingRules(rules: TransactionRule[], candidate: MatchCandidate) {
  return rules.filter(rule => ruleMatches(rule, candidate));
}

export function applyTransactionRules(rules: TransactionRule[], candidate: MatchCandidate, fallbackType: LedgerFlow = 'expense'): RuleApplication {
  const matches = matchingRules(rules.filter(rule => rule.enabled && !rule.archived_at), candidate);
  if (matches.length === 0) return { status: 'none' };
  if (matches.length > 1) return { status: 'conflict', rules: matches };
  const rule = matches[0];
  const category = rule.assign_category;
  return {
    status: 'match',
    rule,
    category,
    type: transactionTypeForCategory(category, fallbackType),
    needs_review: categoryNeedsReview(category),
    property_id: rule.assign_property_id || candidate.property_id || null,
  };
}

/** Apply rules only when the draft is still unclassified. Preserve existing classifications. */
export function classifyWithRules<T extends { category: string; type: LedgerFlow; needs_review: boolean }>(
  draft: T,
  rules: TransactionRule[],
  candidate: MatchCandidate,
): T & { ruleStatus: RuleApplication['status'] } {
  if (!/needs review|uncategor/i.test(draft.category)) return { ...draft, ruleStatus: 'none' };

  const applied = applyTransactionRules(rules, candidate, draft.type);
  if (applied.status === 'match') {
    return {
      ...draft,
      category: applied.category,
      type: applied.type,
      needs_review: applied.needs_review,
      ruleStatus: 'match',
    };
  }
  if (applied.status === 'conflict') {
    return {
      ...draft,
      category: 'Needs Review',
      type: draft.type,
      needs_review: true,
      ruleStatus: 'conflict',
    };
  }
  return { ...draft, ruleStatus: 'none' };
}

export function describeRuleMatch(rule: Pick<TransactionRule, 'match_text' | 'match_direction' | 'match_account_mask' | 'match_property_id'>, propertyName?: string | null) {
  const direction = rule.match_direction === 'incoming' ? 'Incoming' : 'Outgoing';
  const account = normalizeAccountMask(rule.match_account_mask);
  const accountLabel = account ? `••••${account.slice(-4)}` : propertyName || 'any account';
  return `${direction} · ${rule.match_text} · ${accountLabel}`;
}

export function describeRuleAssignment(rule: Pick<TransactionRule, 'assign_category' | 'assign_property_id'>, propertyName?: string | null) {
  return `${rule.assign_category}${propertyName ? ` · ${propertyName}` : ''}`;
}

function looksLikeNoise(value: string) {
  if (/\b(ach|pos|debit|chk|trace|web id)\b/i.test(value)) return true;
  const letters = value.replace(/[^a-z]/g, '');
  return letters.length >= 10 && letters === letters.toUpperCase().toLowerCase() && /\d{5,}/.test(value);
}
