
import { Instrument } from './types';

// La API_KEY ya no es necesaria aquí porque el servidor la maneja internamente
export const FMP_API_KEY = 'GYltwxEyGgaAnA4LvrRLtOGS1S8qv2wN'; 
export const REFRESH_INTERVAL_MS = 300000; // 5 minutes

export const INSTRUMENTS_DATA: Record<string, string[]> = {
  "forex": [
    "EUR/USD", "USD/JPY", "GBP/USD", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD", "EUR/GBP", "USD/CNH", "EUR/JPY", "GBP/JPY", "AUD/JPY", "EUR/CHF", "USD/MXN"
  ],
  "indices": [
    "SPX", "IXIC", "DJI", "NDX", "N225", "HSI", "KS11", "FTSE", "BVSP", "DAX", "CAC", "STOXX50E", "SSEC", "AXJO", "RUT"
  ],
  "stocks": [
    "NVDA", "MSFT", "GOOGL", "AMZN", "TSM", "META", "AVGO", "LRCX", "KLAC", "NFLX", "V", "MU", "AAPL", "TSLA", "ORCL", "ASML", "AMD", "LLY"
  ],
  "commodities": [
    "XAG/USD", "XAU/USD", "WTI", "CC", "KC"
  ],
  "crypto": [
    "BTC/USD", "ETH/USD", "SOL/USD", "BNB/USD", "XRP/USD", "ADA/USD", "DOT/USD", "LINK/USD"
  ]
};

export const ALL_INSTRUMENTS: Instrument[] = Object.entries(INSTRUMENTS_DATA).flatMap(([type, symbols]) => 
  symbols.map(symbol => ({
    id: symbol,
    name: symbol,
    symbol: symbol,
    type: type as Instrument['type'],
    marketStatus: 'open' 
  }))
);

export const TIMEFRAMES: { label: string, value: any }[] = [
  { label: '4H', value: '4h' },
  { label: '1H', value: '1h' },
  { label: '15M', value: '15min' },
  { label: '5M', value: '5min' },
  { label: '30S', value: '30s' }
];