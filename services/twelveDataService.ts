
import { Candlestick, Timeframe } from '../types';

export const PriceStore: Record<string, number> = {};

export const fetchTimeSeries = async (symbol: string, interval: string): Promise<Candlestick[]> => {
  try {
    // IMPORTANTE: Limpiamos el símbolo antes de enviarlo al proxy
    const cleanSymbol = symbol.trim();
    const url = `/api/proxy?symbol=${encodeURIComponent(cleanSymbol)}`;
    
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    
    // Accedemos a las velas (soportando formato objeto o formato array directo)
    const rawCandles = data.values || (Array.isArray(data) ? data : []);

    if (rawCandles.length === 0) return [];
    
    const candles = rawCandles.map((v: any) => ({
      datetime: v.datetime,
      open: parseFloat(v.open || 0),
      high: parseFloat(v.high || 0),
      low: parseFloat(v.low || 0),
      close: parseFloat(v.close || 0),
      volume: parseInt(v.volume || 0)
    })).reverse();

    // Actualizamos el almacén de precios con el último cierre
    if (candles.length > 0) {
      PriceStore[symbol] = candles[candles.length - 1].close;
    }

    return candles;
  } catch (error) { 
    return []; 
  }
};

// fetchCryptoPrice eliminado. Solo se usa el proxy ahora.

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
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  
  // Forex: Domingo 22:00 UTC a Viernes 22:00 UTC
  if (type === 'forex') {
    if (day === 0) return hour >= 22;
    if (day === 5) return hour < 22;
    return day >= 1 && day <= 4;
  }
  
  // Indices y Acciones (Aproximación US Market 14:30 - 21:00 UTC)
  if (type === 'indices' || type === 'stocks') {
    if (day === 0 || day === 6) return false;
    const timeInMinutes = hour * 60 + minute;
    // 14:30 UTC = 870 min, 21:00 UTC = 1260 min
    return timeInMinutes >= 870 && timeInMinutes <= 1260;
  }
  
  return day >= 1 && day <= 5;
};