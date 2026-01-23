import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Instrument, MultiTimeframeAnalysis, SignalType, ActionType, Timeframe, Strategy, Candlestick } from '../types';
import { fetchTimeSeries, PriceStore, resampleCandles, isMarketOpen } from '../services/twelveDataService';

const GlobalAnalysisCache: Record<string, { analysis: MultiTimeframeAnalysis, trigger: number }> = {};

interface InstrumentRowProps {
  instrument: Instrument;
  isConnected: boolean;
  onToggleConnect: (id: string) => void;
  globalRefreshTrigger: number;
  strategy: Strategy;
  onAnalysisUpdate?: (id: string, data: MultiTimeframeAnalysis | null) => void;
  isTestMode?: boolean;
  onOpenChart?: (symbol: string) => void;
}


const InstrumentRow: React.FC<InstrumentRowProps> = ({ 
  instrument, isConnected, onToggleConnect, globalRefreshTrigger, strategy, onAnalysisUpdate, isTestMode = false, onOpenChart
}) => {
  const [isFresh, setIsFresh] = useState(false);
  const [analysis, setAnalysis] = useState<MultiTimeframeAnalysis | null>(() => GlobalAnalysisCache[instrument.id]?.analysis || null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(0);

  // TRADE TRACKER DATA
  const [tradeData, setTradeData] = useState<{type: number, entry: number}>(() => {
    const saved = localStorage.getItem(`trade_data_${instrument.id}`);
    return saved ? JSON.parse(saved) : { type: 0, entry: 0 };
  });

  const lastRefreshTriggerRef = useRef<number>(GlobalAnalysisCache[instrument.id]?.trigger ?? -1);

  // ACTUALIZACIÓN DE PRECIO (Sin CoinGecko para evitar error 429)
  useEffect(() => {
    if (PriceStore[instrument.symbol]) {
      setCurrentPrice(PriceStore[instrument.symbol]);
    }
  }, [analysis]);

  // SONIDOS
  const playAlertSound = useCallback((type: 'entry' | 'exit') => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(type === 'entry' ? 440 : 660, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(type === 'entry' ? 880 : 330, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.5);
  }, []);

  const playTPSound = useCallback(() => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1);
    osc.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
  }, []);

  // VIGILANCIA DE TAKE PROFIT
  useEffect(() => {
    if (tradeData.type !== 0 && currentPrice > 0) {
      const tpPrice = tradeData.type === 1 ? tradeData.entry * 1.01 : tradeData.entry * 0.99;
      const isTPHit = tradeData.type === 1 ? currentPrice >= tpPrice : currentPrice <= tpPrice;
      if (isTPHit && !localStorage.getItem(`tp_hit_${instrument.id}`)) {
        playTPSound();
        localStorage.setItem(`tp_hit_${instrument.id}`, 'true');
      }
    }
  }, [currentPrice, tradeData, instrument.id, playTPSound]);

  const cycleTradeMarker = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTradeData(prev => {
      const nextType = (prev.type + 1) % 3;
      const newData = { type: nextType, entry: nextType !== 0 ? (currentPrice || analysis?.price || 0) : 0 };
      localStorage.setItem(`trade_data_${instrument.id}`, JSON.stringify(newData));
      localStorage.removeItem(`tp_hit_${instrument.id}`);
      return newData;
    });
  };

  const pnl = (tradeData.type !== 0 && (currentPrice || analysis?.price) && tradeData.entry) 
    ? (tradeData.type === 1 ? ((currentPrice || analysis?.price || 0) - tradeData.entry) : (tradeData.entry - (currentPrice || analysis?.price || 0))) / tradeData.entry * 100 
    : null;

  // Lógica de análisis (PerformAnalysis omitida para brevedad pero mantenla igual a tu original)
  // ... (Aquí va tu función performAnalysis y el useEffect que la llama)

  const marketOpen = isMarketOpen(instrument.type, instrument.symbol);

  return (
    <div className={`flex items-center justify-between p-3 rounded-2xl border bg-white/[0.03] border-white/5`}>
      <div className="flex flex-col w-1/4">
        <div className="flex items-center space-x-2">
          <span className="font-mono font-bold text-white text-lg">{instrument.symbol}</span>
          {isFresh && <span className="px-1.5 py-0.5 rounded bg-sky-500 text-black text-[9px] font-black animate-pulse">NOW</span>}
          <button onClick={() => onOpenChart?.(instrument.symbol)} className="p-1.5 hover:bg-emerald-500/20 rounded-lg">📈</button>
        </div>
      </div>

      {/* SECCIÓN SCORE Y ACCIÓN OMITIDA POR BREVEDAD - MANTÉN TU ORIGINAL */}

      {/* TRADE TRACKER COLUMNA */}
      <div className="flex items-center ml-8 pl-6 border-l border-white/5 min-w-[180px]">
        <button onClick={cycleTradeMarker} className={`w-12 h-12 rounded-2xl border transition-all ${tradeData.type === 1 ? 'bg-emerald-500 text-black' : tradeData.type === 2 ? 'bg-rose-500 text-black' : 'bg-white/5'}`}>
          {tradeData.type === 0 ? '+' : tradeData.type === 1 ? '▲' : '▼'}
        </button>
        {tradeData.type !== 0 && (
          <div className="flex flex-col ml-3">
            <span className={`text-sm font-black ${pnl && pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{pnl?.toFixed(2)}%</span>
            <span className="text-[10px] text-white font-bold">In: ${tradeData.entry.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(InstrumentRow);