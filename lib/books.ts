export type BookRecord = {
  id?: string; title: string; author: string; total_count: number; category: string;
  status: string; purchase_date: string | null; platform: string; cover_url: string;
  purchase_year?: number | null; finished_date: string | null; rating: number | null;
  read_count: number; list_price: number; paid_price: number; purchase_method: string;
  liked_notes: string[]; disliked_notes: string[]; reading_dates?: string[]; source_url?: string; created_at?: string;
};
