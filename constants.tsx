import { Instrument } from './types';

// Configuración Global
export const REFRESH_INTERVAL_MS = 300000; // 5 minutos

export const INSTRUMENT_NAMES: Record<string, string> = {
  // --- FOREX ---
  "EUR/USD": "Euro / US Dollar",
  "USD/JPY": "US Dollar / Japanese Yen",
  "GBP/USD": "British Pound / US Dollar",
  "AUD/USD": "Australian Dollar / US Dollar",
  "USD/CAD": "US Dollar / Canadian Dollar",
  "USD/CHF": "US Dollar / Swiss Franc",
  "NZD/USD": "NZ Dollar / US Dollar",
  "EUR/GBP": "Euro / British Pound",
  "USD/CNH": "US Dollar / Chinese Yuan",
  "EUR/JPY": "Euro / Japanese Yen",
  "GBP/JPY": "British Pound / Japanese Yen",
  "AUD/JPY": "Australian Dollar / Japanese Yen",
  "EUR/CHF": "Euro / Swiss Franc",
  "USD/MXN": "US Dollar / Mexican Peso",

  // --- INDICES ---
  "SPX": "S&P 500 Index",
  "IXIC": "Nasdaq Composite",
  "DJI": "Dow Jones Industrial",
  "NDX": "Nasdaq 100 Index",
  "N225": "Nikkei 225 (Japan)",
  "HSI": "Hang Seng Index (HK)",
  "KS11": "KOSPI (South Korea)",
  "FTSE": "FTSE 100 (London)",
  "BVSP": "IBOVESPA (Brazil)",
  "DAX": "DAX 40 (Germany)",
  "CAC": "CAC 40 (France)",
  "STOXX50E": "EURO STOXX 50",
  "SSEC": "Shanghai Composite",
  "AXJO": "S&P/ASX 200 (Australia)",
  "RUT": "Russell 2000 Index",

  // --- STOCKS ---
  "NVDA": "NVIDIA Corporation",
  "MSFT": "Microsoft Corp",
  "GOOGL": "Alphabet Inc (Google)",
  "AMZN": "Amazon.com Inc",
  "TSM": "Taiwan Semiconductor",
  "META": "Meta Platforms Inc",
  "AVGO": "Broadcom Inc",
  "LRCX": "Lam Research Corp",
  "KLAC": "KLA Corporation",
  "NFLX": "Netflix Inc",
  "V": "Visa Inc",
  "MU": "Micron Technology",
  "AAPL": "Apple Inc",
  "TSLA": "Tesla Inc",
  "ORCL": "Oracle Corporation",
  "ASML": "ASML Holding NV",
  "AMD": "Advanced Micro Devices",
  "LLY": "Eli Lilly and Company",

  // --- COMMODITIES ---
  "XAU/USD": "Gold Spot / US Dollar",
  "XAG/USD": "Silver Spot / US Dollar",
  "WTI": "Crude Oil WTI",
  "CC": "Cocoa Futures",
  "KC": "Coffee Futures",

  // --- CRYPTO ---
  "BTC/USD": "Bitcoin / US Dollar",
  "ETH/USD": "Ethereum / US Dollar",
  "SOL/USD": "Solana / US Dollar",
  "BNB/USD": "Binance Coin / US Dollar",
  "XRP/USD": "Ripple / US Dollar",
  "ADA/USD": "Cardano / US Dollar",
  "DOT/USD": "Polkadot / US Dollar",
  "LINK/USD": "Chainlink / US Dollar"
};

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
    name: INSTRUMENT_NAMES[symbol] || symbol,
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
  { label: '1M', value: '1min' } // Actualizado a 1 minuto para mayor compatibilidad
];