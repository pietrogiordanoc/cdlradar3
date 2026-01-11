
// Esta función corre en el servidor de Vercel, no en el navegador del usuario.
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval');
  const outputsize = searchParams.get('outputsize') || '500';

  // Obtenemos la KEY desde el entorno seguro del servidor
  const API_KEY = process.env.API_KEY || '93f4a098dc4649c0aeb152ec9e3473da';
  const baseUrl = 'https://api.twelvedata.com/time_series';
  
  const targetUrl = `${baseUrl}?symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&apikey=${API_KEY}`;

  try {
    const response = await fetch(targetUrl);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=30', // Cache de 1 min en el servidor
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
      status: 500,
    });
  }
}
