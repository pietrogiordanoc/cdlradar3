
import { Candlestick, Timeframe } from '../types';

export const PriceStore: Record<string, number> = {};

export const fetchTimeSeries = async (symbol: string, interval: Timeframe, outputSize: number = 1000): Promise<Candlestick[]> => {
  try {
    // Ahora llamamos a nuestra propia ruta /api/proxy
    // Esto oculta nuestra API KEY y permite que Vercel gestione el caché
    const response = await fetch(`/api/proxy?symbol=${symbol}&interval=${interval}&outputsize=${outputSize}`);
    const data = await response.json();
    
    if (data.status === 'error') {
      console.warn(`Error en Proxy (${symbol}):`, data.message);
      return [];
    }
    
    if (!data.values || data.values.length === 0) return [];
    
    const candles = data.values.map((v: any) => ({
      datetime: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseInt(v.volume) || 0
    })).reverse();

    if (candles.length > 0) {
      PriceStore[symbol] = candles[candles.length - 1].close;
    }

    return candles;
  } catch (error) { 
    console.error("Fetch error via Proxy:", error);
    return []; 
  }
};

export const resampleCandles = (candles: Candlestick[], factor: number): Candlestick[] => {
  const resampled: Candlestick[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    if (chunk.length === 0) continue;
    
    resampled.push({
      datetime: chunk[0].datetime,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0)
    });
  }
  return resampled;
};

export const isMarketOpen = (type: string, symbol: string): boolean => {
  if (type === 'crypto') return true;
  const now = new Date();
  const day = now.getUTCDay();
  return day >= 1 && day <= 5;
};
