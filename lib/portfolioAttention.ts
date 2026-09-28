export type PortfolioUnit = {
  id: string;
  property_id: string;
  unit_number: string;
  occupied: boolean;
  tenant_name?: string | null;
  current_rent?: number | null;
  lease_start_date?: string | null;
  lease_end_date?: string | null;
  created_at?: string | null;
};

export type UnitKind = 'move-in' | 'ending' | 'occupied' | 'vacant';
export type WatchTone = 'clear' | 'move-in' | 'warning';

export type UnitAttention = {
  kind: UnitKind;
  label: string;
  tenantLabel: string;
  vacancyDays: number | null;
  moveInDays: number | null;
  leaseEndDays: number | null;
};

function dateKey(value?: string | null) {
  if (!value) return '';
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

function dayNumber(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function todayKey(now: Date) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function dayDiff(key: string, now: Date) {
  return Math.round((dayNumber(key) - dayNumber(todayKey(now))) / 86400000);
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function moveInLabel(days: number, startKey: string, now: Date) {
  if (days <= 0) return 'Move-in today';
  if (days === 1) return 'Move-in in 1 day';
  if (days <= 14) return `Move-in in ${days} days`;
  const [year, month, day] = startKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const formatted = date.toLocaleDateString('en-US', year === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  return `Lease starts ${formatted}`;
}

function endingLabel(days: number) {
  if (days <= 0) return 'Lease ends today';
  if (days === 1) return 'Lease ends in 1 day';
  return `Lease ends in ${days} days`;
}

function vacancyDaysFor(unit: PortfolioUnit, now: Date) {
  const end = dateKey(unit.lease_end_date);
  if (end && dayDiff(end, now) <= 0) return Math.max(0, -dayDiff(end, now));
  const created = dateKey(unit.created_at);
  if (created) return Math.max(0, -dayDiff(created, now));
  return null;
}

export function unitAttention(unit: PortfolioUnit, now = new Date()): UnitAttention {
  const start = dateKey(unit.lease_start_date);
  const end = dateKey(unit.lease_end_date);
  const tenant = (unit.tenant_name || '').trim();
  const startDays = start ? dayDiff(start, now) : null;
  if (startDays !== null && startDays > 0) {
    return {
      kind: 'move-in',
      label: moveInLabel(startDays, start, now),
      tenantLabel: tenant ? `Upcoming · ${tenant}` : 'Upcoming tenant',
      vacancyDays: null,
      moveInDays: startDays,
      leaseEndDays: null,
    };
  }
  if (startDays === 0 && !unit.occupied) {
    return {
      kind: 'move-in',
      label: 'Move-in today',
      tenantLabel: tenant ? `Upcoming · ${tenant}` : 'Upcoming tenant',
      vacancyDays: null,
      moveInDays: 0,
      leaseEndDays: null,
    };
  }
  if (unit.occupied) {
    const endDays = end ? dayDiff(end, now) : null;
    if (endDays !== null && endDays >= 0 && endDays <= 30) {
      return {
        kind: 'ending',
        label: endingLabel(endDays),
        tenantLabel: tenant || '—',
        vacancyDays: null,
        moveInDays: null,
        leaseEndDays: endDays,
      };
    }
    return {
      kind: 'occupied',
      label: 'Occupied',
      tenantLabel: tenant || '—',
      vacancyDays: null,
      moveInDays: null,
      leaseEndDays: endDays !== null && endDays >= 0 ? endDays : null,
    };
  }
  const vacancyDays = vacancyDaysFor(unit, now);
  return {
    kind: 'vacant',
    label: 'Vacant',
    tenantLabel: '—',
    vacancyDays,
    moveInDays: null,
    leaseEndDays: null,
  };
}

export function occupancyCounts(units: PortfolioUnit[], now = new Date()) {
  const occupied = units.filter(unit => {
    const kind = unitAttention(unit, now).kind;
    return kind === 'occupied' || kind === 'ending';
  }).length;
  return { occupied, total: units.length };
}

export function occupancyLabel(units: PortfolioUnit[], now = new Date()) {
  const { occupied, total } = occupancyCounts(units, now);
  if (!total) return 'No units';
  return `${occupied}/${total} occupied`;
}

export function propertyWatch(units: PortfolioUnit[], now = new Date()): { label: string; tone: WatchTone } {
  const items = units.map(unit => unitAttention(unit, now));
  const moveIns = items.filter(item => item.kind === 'move-in' && item.moveInDays !== null).sort((a, b) => a.moveInDays! - b.moveInDays!);
  if (moveIns[0]) return { label: moveIns[0].label, tone: 'move-in' };
  const endings = items.filter(item => item.kind === 'ending' && item.leaseEndDays !== null).sort((a, b) => a.leaseEndDays! - b.leaseEndDays!);
  if (endings[0]) return { label: endings[0].label, tone: 'warning' };
  const vacant = items.filter(item => item.kind === 'vacant');
  if (vacant.length) {
    const known = vacant.map(item => item.vacancyDays).filter((days): days is number => days !== null);
    const count = `${plural(vacant.length, 'unit')} vacant`;
    if (!known.length) return { label: count, tone: 'warning' };
    const longest = Math.max(...known);
    return { label: `${count} · ${plural(longest, 'day')}`, tone: 'warning' };
  }
  return { label: 'All clear', tone: 'clear' };
}

export function formatLeaseDate(value?: string | null) {
  const key = dateKey(value);
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function leaseRangeLabel(unit: PortfolioUnit) {
  const start = formatLeaseDate(unit.lease_start_date);
  const end = formatLeaseDate(unit.lease_end_date);
  if (start && end) return `${start} – ${end}`;
  return start || end || '—';
}
