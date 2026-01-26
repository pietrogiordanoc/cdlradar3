import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://yhgqmbexjscojlrzguvh.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3FtYmV4anNjb2pscnpndXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNzA1NTcsImV4cCI6MjA4Mjc0NjU1N30.uXFLknfgsZ_3yH5t9cW0dfbwN_b3uOi6jcfM06inVu4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'apikey': supabaseAnonKey
    }
  }
});

// Tipo para los datos de mercado
export interface MarketCacheRow {
  symbol: string;
  data: any; // JSONB field
  updated_at: string;
  time_series_data: any; // JSONB field (puede ser array o objeto)
}
