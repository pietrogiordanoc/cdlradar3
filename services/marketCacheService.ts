import { supabase, MarketCacheRow } from './supabaseClient';

/**
 * Obtiene los datos de mercado para un símbolo específico usando fetch directo
 */
export async function getMarketData(symbol: string): Promise<MarketCacheRow | null> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://yhgqmbexjscojlrzguvh.supabase.co';
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3FtYmV4anNjb2pscnpndXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNzA1NTcsImV4cCI6MjA4Mjc0NjU1N30.uXFLknfgsZ_3yH5t9cW0dfbwN_b3uOi6jcfM06inVu4';
    
    const url = `${supabaseUrl}/rest/v1/market_cache?symbol=eq.${encodeURIComponent(symbol)}&select=*`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    if (!response.ok) {
      console.error(`Error fetching data for ${symbol}: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.warn(`No data found for ${symbol}`);
      return null;
    }

    return data[0] as MarketCacheRow;
  } catch (err) {
    console.error(`Exception fetching data for ${symbol}:`, err);
    return null;
  }
}

/**
 * Obtiene los datos de mercado para múltiples símbolos
 */
export async function getMultipleMarketData(symbols: string[]): Promise<MarketCacheRow[]> {
  try {
    const { data, error } = await supabase
      .from('market_cache')
      .select('*')
      .in('symbol', symbols);

    if (error) {
      console.error('Error fetching multiple symbols:', error);
      return [];
    }

    return data as MarketCacheRow[];
  } catch (err) {
    console.error('Exception fetching multiple symbols:', err);
    return [];
  }
}

/**
 * Suscripción en tiempo real a cambios en market_cache
 */
export function subscribeToMarketData(
  symbol: string,
  callback: (data: MarketCacheRow) => void
) {
  const subscription = supabase
    .channel(`market_cache_${symbol}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'market_cache',
        filter: `symbol=eq.${symbol}`
      },
      (payload) => {
        callback(payload.new as MarketCacheRow);
      }
    )
    .subscribe();

  return subscription;
}
