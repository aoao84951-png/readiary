export type BookRecord = {
  id?: string; title: string; author: string; total_count: number; category: string;
  status: string; purchase_date: string | null; platform: string; cover_url: string;
  purchase_year?: number | null; finished_date: string | null; rating: number | null;
  read_count: number; list_price: number; paid_price: number; purchase_method: string;
  liked_notes: string[]; disliked_notes: string[]; source_url?: string; created_at?: string;
};

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export async function supabaseRequest(path: string, init?: RequestInit) {
  const config = supabaseConfig();
  if (!config) return null;
  return fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}
