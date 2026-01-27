import { Candlestick, Timeframe } from '../types';
import { getMarketData } from './marketCacheService';

export const PriceStore: Record<string, number> = {};

export const fetchTimeSeries = async (symbol: string, interval: string): Promise<Candlestick[]> => {
	try {
		// LECTURA DIRECTA DESDE SUPABASE
		const marketData = await getMarketData(symbol);
		
		if (!marketData) {
			console.warn(`No data found in Supabase for ${symbol}`);
			return [];
		}
    
		// time_series_data es JSONB - puede ser array directo o estar anidado
		let rawValues = marketData.time_series_data;
		
		// Si es null o undefined, intenta array vacío
		if (!rawValues) {
			console.warn(`No time_series_data for ${symbol}`);
			return [];
		}
		
		// Si time_series_data es un objeto con un array dentro, extraerlo
		if (!Array.isArray(rawValues) && rawValues.values) {
			rawValues = rawValues.values;
		}
		
		// Si aún no es array, convertir a array
		if (!Array.isArray(rawValues)) {
			rawValues = [rawValues];
		}

		if (rawValues.length === 0) return [];
    
	const candles = rawValues
		.map((v: any) => ({
			datetime: v.datetime,
			open: parseFloat(v.open),
			high: parseFloat(v.high),
			low: parseFloat(v.low),
			close: parseFloat(v.close),
			volume: parseInt(v.volume) || 0
		}))
		.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

		if (candles.length > 0) {
			PriceStore[symbol] = candles[candles.length - 1].close;
		}

		return candles;
	} catch (error) {
		console.error(`Error in fetchTimeSeries for ${symbol}:`, error);
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
