
export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  // Limpiamos espacios y posibles errores de codificación
  const symbol = decodeURIComponent(searchParams.get('symbol') || '').trim();
  
  const SB_URL = 'https://yhgqmbexjscojlrzguvh.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3FtYmV4anNjb2pscnpndXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNzA1NTcsImV4cCI6MjA4Mjc0NjU1N30.uXFLknfgsZ_3yH5t9cW0dfbwN_b3uOi6jcfM06inVu4';

  if (!symbol) return new Response('No symbol', { status: 400 });

  try {
    // CAPA 1: Intento con el símbolo exacto (con barra)
    let targetUrl = `${SB_URL}/rest/v1/market_cache?symbol=eq.${encodeURIComponent(symbol)}&select=data`;
    let response = await fetch(targetUrl, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    let result = await response.json();

    // CAPA 2: Si falla, intentamos sin la barra (fallback)
    if (!result || result.length === 0) {
      const altSymbol = symbol.replace('/', '');
      targetUrl = `${SB_URL}/rest/v1/market_cache?symbol=eq.${altSymbol}&select=data`;
      response = await fetch(targetUrl, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
      });
      result = await response.json();
    }

    if (!result || result.length === 0) {
      return new Response(JSON.stringify({ status: 'error', symbol }), { status: 404 });
    }

    return new Response(JSON.stringify(result[0].data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=10' }
    });
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}
