import { supabase } from './client';
import { getAuthState } from './auth';

export interface ChangelogEntryRow {
  id: number;
  version: string;
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
  added: string[] | null;
  changed: string[] | null;
  fixed: string[] | null;
  locale: string | null;
  created_at: string;
  updated_at: string | null;
}

export type ChangelogEntryInput = {
  version: string;
  title: string;
  date?: string;
  description?: string;
  added?: string[] | null;
  changed?: string[] | null;
  fixed?: string[] | null;
  locale?: 'en' | 'ar' | null;
};

function coerceStringArray(value: unknown): string[] | null {
  if (!value) return null;
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) out.push(s);
    }
  }
  return out.length > 0 ? out : null;
}

export async function fetchChangelogEntries(locale?: 'en' | 'ar'): Promise<ChangelogEntryRow[]> {
  if (!supabase) return [];

  try {
    let q = supabase
      .from('changelog_entries')
      .select('id, version, title, date, description, added, changed, fixed, locale, created_at, updated_at')
      .order('date', { ascending: false })
      .order('id', { ascending: false });

    if (locale) {
      // Prefer matching locale, but keep rows with null locale as "generic".
      q = q.in('locale', [locale, null as any]);
    }

    const { data, error } = await q;
    if (error || !data) return [];

    return (data as any[]).map((row) => ({
      id: row.id,
      version: row.version ?? '',
      title: row.title ?? '',
      date: row.date ?? '',
      description: row.description ?? '',
      added: coerceStringArray(row.added),
      changed: coerceStringArray(row.changed),
      fixed: coerceStringArray(row.fixed),
      locale: row.locale ?? null,
      created_at: row.created_at ?? '',
      updated_at: row.updated_at ?? null,
    }));
  } catch {
    return [];
  }
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { user } = getAuthState();
  if (!user) return false;

  try {
    const { data, error } = await supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

export async function createChangelogEntry(input: ChangelogEntryInput): Promise<void> {
  if (!supabase) return;

  const payload = {
    version: input.version.trim(),
    title: input.title.trim(),
    date: (input.date && input.date.trim()) || undefined,
    description: (input.description ?? '').toString(),
    added: coerceStringArray(input.added) ?? null,
    changed: coerceStringArray(input.changed) ?? null,
    fixed: coerceStringArray(input.fixed) ?? null,
    locale: input.locale ?? null,
  };

  await supabase.from('changelog_entries').insert(payload as any);
}

export async function updateChangelogEntry(id: number, input: ChangelogEntryInput): Promise<void> {
  if (!supabase) return;

  const payload = {
    version: input.version.trim(),
    title: input.title.trim(),
    date: (input.date && input.date.trim()) || undefined,
    description: (input.description ?? '').toString(),
    added: coerceStringArray(input.added) ?? null,
    changed: coerceStringArray(input.changed) ?? null,
    fixed: coerceStringArray(input.fixed) ?? null,
    locale: input.locale ?? null,
  };

  await supabase.from('changelog_entries').update(payload as any).eq('id', id);
}

export async function deleteChangelogEntry(id: number): Promise<void> {
  if (!supabase) return;
  await supabase.from('changelog_entries').delete().eq('id', id);
}

