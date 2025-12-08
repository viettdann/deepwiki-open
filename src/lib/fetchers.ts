import { headers } from 'next/headers';

type ProcessedProject = {
  id: string;
  owner: string;
  repo: string;
  name: string;
  repo_type: string;
  submittedAt: number;
  language: string;
};

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('host') || 'localhost:3000';
  const proto = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  return `${proto}://${host}`;
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${await getBaseUrl()}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getAuthRequired(): Promise<boolean> {
  try {
    const data = await fetchJson<{ auth_required: boolean }>(
      '/api/auth/status',
      { cache: 'no-store' }
    );
    return Boolean(data.auth_required);
  } catch {
    return true;
  }
}

export async function getProcessedProjects(ttl: number = 30): Promise<ProcessedProject[]> {
  try {
    const url = '/api/wiki/projects';
    const base = await getBaseUrl();
    const res = await fetch(`${base}${url}`, { next: { revalidate: ttl } });
    if (!res.ok) return [];
    const data = await res.json();
    if (data?.error) return [];
    return Array.isArray(data) ? (data as ProcessedProject[]) : [];
  } catch {
    return [];
  }
}

export async function getJobs(params: { status?: string; limit?: number; offset?: number }, ttl: number = 5): Promise<{ jobs: unknown[]; total: number }> {
  const search = new URLSearchParams();
  if (params.status) search.append('status', params.status);
  if (params.limit != null) search.append('limit', String(params.limit));
  if (params.offset != null) search.append('offset', String(params.offset));
  const url = `/api/wiki/jobs?${search.toString()}`;
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}${url}`, { next: { revalidate: ttl } });
    if (!res.ok) return { jobs: [], total: 0 };
    const data = await res.json();
    return { jobs: (data.jobs || []) as unknown[], total: data.total || 0 };
  } catch {
    return { jobs: [], total: 0 };
  }
}

export async function getJobDetail(jobId: string, ttl: number = 0): Promise<unknown | null> {
  try {
    const url = `/api/wiki/jobs/${jobId}`;
    const base = await getBaseUrl();
    const res = await fetch(`${base}${url}`, ttl > 0 ? { next: { revalidate: ttl } } : { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}
