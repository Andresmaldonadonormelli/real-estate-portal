import { categoryKey } from './accounting';
import { shortPropertyName } from './formatters';

export type ReminderUnit = {
  id?: string;
  property_id: string;
  unit_number?: string | null;
  occupied?: boolean | null;
  tenant_name?: string | null;
  lease_end_date?: string | null;
};

export type ReminderDocument = {
  id: string;
  property_id: string;
  unit_id?: string | null;
  category?: string | null;
  title?: string | null;
  notes?: string | null;
  expires_at?: string | null;
};

export type UpcomingReminder = {
  id: string;
  propertyId: string;
  title: string;
  detail: string;
  when: string;
  month: string;
  day: string;
  days: number;
  href: string;
  sort: number;
};

type LeaseReminder = UpcomingReminder & {
  tenant: string;
  unitLabel: string;
  propertyLabel: string;
};

function dateKey(value?: string | null) {
  const key = (value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

function dayNumber(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function todayKey(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function relativeWhen(days: number) {
  if (days < 0) return days === -1 ? '1 day ago' : `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 45) return `In ${days} days`;
  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? 'In about 1 month' : `In about ${months} months`;
}

function eventTitle(category: string) {
  const key = categoryKey(category);
  if (key === 'insurance') return 'Insurance renewal';
  if (key === 'taxes') return 'Property tax due';
  if (/inspect/i.test(category)) return 'Inspection';
  if (/lease/i.test(category)) return 'Lease ending';
  return category.trim() || 'Reminder';
}

function isLeaseCategory(category?: string | null) {
  return /lease/i.test(category || '');
}

export function unitReminderLabel(unitNumber?: string | null) {
  const stripped = (unitNumber || '').trim().replace(/^unit\s+/i, '').replace(/^#/, '');
  return stripped ? `Unit #${stripped}` : '';
}

function tenantFromDocument(document: ReminderDocument) {
  const notes = (document.notes || '').match(/signed lease for (.+)/i)?.[1]?.trim();
  if (notes) return notes;
  const parts = (document.title || '').split('·').map((part) => part.trim()).filter(Boolean);
  const last = parts.length >= 2 ? parts[parts.length - 1] : '';
  if (!last || /lease/i.test(last)) return '';
  return last;
}

function leaseDetail(propertyLabel: string, unitLabel: string, tenant: string) {
  return [propertyLabel, unitLabel, tenant].filter(Boolean).join(' · ');
}

/** One reminder per real event. A lease document and the unit it belongs to stay one row. */
export function buildUpcomingReminders(
  properties: { id: string; address: string }[],
  units: ReminderUnit[],
  documents: ReminderDocument[],
  now = new Date(),
) {
  const today = todayKey(now);
  const names = new Map(properties.map((property) => [property.id, shortPropertyName(property.address)]));
  const leases = new Map<string, LeaseReminder>();

  const rememberLease = (input: { propertyId: string; unitId: string; end: string; unitLabel: string; tenant: string; href: string }) => {
    if (!names.has(input.propertyId)) return;
    const days = Math.round((dayNumber(input.end) - dayNumber(today)) / 86400000);
    if (days < -14 || days > 365) return;
    const key = `${input.propertyId}|${input.unitId}|${input.end}|lease-ending`;
    const date = new Date(`${input.end}T12:00:00`);
    const current = leases.get(key);
    const tenant = current?.tenant || input.tenant;
    const unitLabel = current?.unitLabel || input.unitLabel;
    const propertyLabel = names.get(input.propertyId) || '';
    leases.set(key, {
      id: key,
      propertyId: input.propertyId,
      title: 'Lease ending',
      tenant,
      unitLabel,
      propertyLabel,
      detail: leaseDetail(propertyLabel, unitLabel, tenant),
      when: relativeWhen(days),
      month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: String(date.getDate()),
      days,
      href: current?.href || input.href,
      sort: dayNumber(input.end),
    });
  };

  units.forEach((unit) => {
    const end = dateKey(unit.lease_end_date);
    if (!end) return;
    const unitId = unit.id || `${unit.property_id}:${unit.unit_number || ''}:${end}`;
    rememberLease({
      propertyId: unit.property_id,
      unitId,
      end,
      unitLabel: unitReminderLabel(unit.unit_number),
      tenant: (unit.tenant_name || '').trim(),
      href: `/properties/${unit.property_id}?tab=units`,
    });
  });

  const other: UpcomingReminder[] = [];
  documents.forEach((document) => {
    const due = dateKey(document.expires_at);
    if (!due || !names.has(document.property_id)) return;
    const lease = isLeaseCategory(document.category);
    const matched = lease
      ? units.find((unit) => (document.unit_id && unit.id === document.unit_id) || (!document.unit_id && unit.property_id === document.property_id && dateKey(unit.lease_end_date) === due))
      : undefined;
    if (lease || matched) {
      const unitId = matched
        ? (matched.id || `${matched.property_id}:${matched.unit_number || ''}:${due}`)
        : (document.unit_id || `${document.property_id}:${due}`);
      rememberLease({
        propertyId: document.property_id,
        unitId,
        end: due,
        unitLabel: unitReminderLabel(matched?.unit_number),
        tenant: (matched?.tenant_name || '').trim() || tenantFromDocument(document),
        href: `/properties/${document.property_id}?tab=units`,
      });
      return;
    }
    const days = Math.round((dayNumber(due) - dayNumber(today)) / 86400000);
    if (days < -14 || days > 365) return;
    const date = new Date(`${due}T12:00:00`);
    other.push({
      id: `doc-${document.id}`,
      propertyId: document.property_id,
      title: eventTitle(document.category || ''),
      detail: `${names.get(document.property_id)}${document.title ? ` · ${document.title}` : ''}`,
      when: relativeWhen(days),
      month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: String(date.getDate()),
      days,
      href: `/properties/${document.property_id}?tab=documents`,
      sort: dayNumber(due),
    });
  });

  return [...leases.values(), ...other].sort((a, b) => a.sort - b.sort || a.detail.localeCompare(b.detail));
}
