export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  // Limpiamos y decodificamos el símbolo (ej: EUR%2FUSD -> EUR/USD)
  const symbol = decodeURIComponent(searchParams.get('symbol') || '').trim();
  
  const SB_URL = 'https://yhgqmbexjscojlrzguvh.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3FtYmV4anNjb2pscnpndXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNzA1NTcsImV4cCI6MjA4Mjc0NjU1N30.uXFLknfgsZ_3yH5t9cW0dfbwN_b3uOi6jcfM06inVu4';

  if (!symbol) return new Response('No symbol provided', { status: 400 });

  try {
    // 1. CONSULTA EXCLUSIVA A SUPABASE
    // Usamos encodeURIComponent para que la barra / no rompa la URL de la API de Supabase
    const targetUrl = `${SB_URL}/rest/v1/market_cache?symbol=eq.${encodeURIComponent(symbol)}&select=data`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    // 2. LÓGICA DE CIERRE: Si no está en Supabase, fin de la historia.
    if (!result || result.length === 0) {
      console.log(`[Proxy] Símbolo no encontrado en Supabase: ${symbol}`);
      return new Response(JSON.stringify({ 
        status: 'error', 
        message: 'Instrumento no disponible en caché de Supabase' 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. RETORNO DE DATOS
    // Devolvemos el JSON que tu feeder guardó (las 5000 velas)
    return new Response(JSON.stringify(result[0].data), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache' // Forzamos a leer siempre lo más nuevo de Supabase
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Supabase Connection Error' }), {
      status: 500,
    });
  }
}