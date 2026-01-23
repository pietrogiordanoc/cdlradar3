  // Helper para texto de acción
  const getActionText = (action?: ActionType, score: number = 0, mainSignal?: SignalType) => {
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
      return mainSignal === SignalType.SALE ? 'VENDER' : 'COMPRAR';
    }
    if (action === ActionType.MERCADO_CERRADO) return '🔒 CERRADO';
    return action || 'STANDBY';
  };
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Instrument, MultiTimeframeAnalysis, SignalType, ActionType, Timeframe, Strategy, Candlestick } from '../types';
import { fetchTimeSeries, PriceStore, resampleCandles, isMarketOpen } from '../services/twelveDataService';

const GlobalAnalysisCache: Record<string, { analysis: MultiTimeframeAnalysis, trigger: number }> = {};

interface InstrumentRowProps {
  instrument: Instrument;
  globalRefreshTrigger: number;
  strategy: Strategy;
  onAnalysisUpdate?: (id: string, data: MultiTimeframeAnalysis | null) => void;
  onOpenChart?: (symbol: string) => void;
  isChartOpen?: boolean;
}

const InstrumentRow: React.FC<InstrumentRowProps> = ({ 
  instrument, globalRefreshTrigger, strategy, onAnalysisUpdate, onOpenChart, isChartOpen
}) => {
  const [isFresh, setIsFresh] = useState(false);
  const [analysis, setAnalysis] = useState<MultiTimeframeAnalysis | null>(() => GlobalAnalysisCache[instrument.id]?.analysis || null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  
  // TRADE TRACKER
  const [tradeData, setTradeData] = useState<{type: number, entry: number}>(() => {
    const saved = localStorage.getItem(`trade_data_${instrument.id}`);
    return saved ? JSON.parse(saved) : { type: 0, entry: 0 };
  });

  const lastActionRef = useRef<ActionType | null>(null);
  const lastRefreshTriggerRef = useRef<number>(GlobalAnalysisCache[instrument.id]?.trigger ?? -1);

  // EFECTOS Y ANÁLISIS (RESTAURADO)
  const performAnalysis = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const data5m = await fetchTimeSeries(instrument.symbol, '5min', 5000);
      if (data5m.length >= 100) {
        const combinedData = {
          '5min': data5m, '15min': resampleCandles(data5m, 3),
          '1h': resampleCandles(data5m, 12), '4h': resampleCandles(data5m, 48)
        };
        const result = strategy.analyze(instrument.symbol, combinedData as any, false, instrument);
        
        if (result.action !== lastActionRef.current) setIsFresh(true);
        else setIsFresh(false);

        lastActionRef.current = result.action;
        setAnalysis(result);
        GlobalAnalysisCache[instrument.id] = { analysis: result, trigger: globalRefreshTrigger };
        if (onAnalysisUpdate) onAnalysisUpdate(instrument.id, result);
      }
    } finally { setIsLoading(false); }
  }, [instrument, strategy, globalRefreshTrigger]);

  useEffect(() => {
    if (globalRefreshTrigger !== lastRefreshTriggerRef.current) {
      lastRefreshTriggerRef.current = globalRefreshTrigger;
      performAnalysis();
    }
  }, [globalRefreshTrigger, performAnalysis]);

  useEffect(() => {
    if (PriceStore[instrument.symbol]) setCurrentPrice(PriceStore[instrument.symbol]);
  }, [analysis]);

  // UI HELPERS (RESTAURADOS)
  const getActionColor = (action?: ActionType, score: number = 0) => {
    if (action === ActionType.ENTRAR_AHORA && score >= 85) return 'text-emerald-400 bg-emerald-500/20 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]';
    if (action === ActionType.SALIR) return 'text-rose-400 bg-rose-500/20 border-rose-400';
    if (action === ActionType.ESPERAR) return 'text-amber-400 bg-amber-500/10 border-amber-400/30';
    return 'text-neutral-500 bg-white/5 border-white/5';
  };

  const getSignalDotColor = (tf: Timeframe) => {
    if (!analysis?.signals) return 'bg-neutral-800';
    const sig = analysis.signals[tf];
    return sig === SignalType.BUY ? 'bg-emerald-500' : sig === SignalType.SALE ? 'bg-rose-500' : 'bg-neutral-800';
  };

  const cycleTradeMarker = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTradeData(prev => {
      const nextType = (prev.type + 1) % 3;
      const newData = { type: nextType, entry: nextType !== 0 ? (currentPrice || analysis?.price || 0) : 0 };
      localStorage.setItem(`trade_data_${instrument.id}`, JSON.stringify(newData));
      return newData;
    });
  };

  const pnl = (tradeData.type !== 0 && tradeData.entry > 0) ? (tradeData.type === 1 ? (currentPrice - tradeData.entry) : (tradeData.entry - currentPrice)) / tradeData.entry * 100 : null;

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-2xl border bg-white/[0.03] border-white/5 transition-all duration-500 ${isChartOpen ? 'ring-2 ring-sky-500/50 bg-sky-500/5' : ''}`}>
      <div className="flex flex-row items-center justify-between w-full">
        {/* COLUMNA STATUS */}
        <div className="w-24 flex justify-center">
            <div className={`h-2 w-2 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : (isMarketOpen(instrument.type, instrument.symbol) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-neutral-700')}`} />
        </div>

        {/* COLUMNA INSTRUMENT */}
        <div className="w-1/4 flex flex-col">
          <div className="flex items-center space-x-2">
            <span className="font-mono font-bold text-white text-lg">{instrument.symbol}</span>
            {isFresh && <span className="px-1.5 py-0.5 rounded bg-sky-500 text-black text-[9px] font-black animate-pulse">NOW</span>}
            <button onClick={() => onOpenChart?.(instrument.symbol)} className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-500 hover:text-sky-400 transition-colors">📈</button>
          </div>
          <span className="text-[9px] text-neutral-500 uppercase tracking-widest">{instrument.name}</span>
        </div>

        {/* COLUMNA MTF (RESTAURADA) */}
        <div className="w-1/3 flex justify-center space-x-6">
          {(['4h', '1h', '15min', '5min'] as Timeframe[]).map(tf => (
            <div key={tf} className="flex flex-col items-center">
              <span className="text-[7px] text-neutral-500 font-bold mb-1 uppercase">{tf}</span>
              <div className={`h-1.5 w-8 rounded-full ${getSignalDotColor(tf)}`} />
            </div>
          ))}
        </div>

        {/* COLUMNA SCORE (RESTAURADA) */}
        <div className="w-1/6 text-center">
          <span className={`text-xl font-black font-mono ${analysis?.powerScore && analysis.powerScore >= 85 ? 'text-emerald-400' : 'text-neutral-500'}`}>{analysis?.powerScore || 0}</span>
        </div>

        {/* COLUMNA SESSION (RESTAURADA) */}
        <div className="w-40 text-center text-[10px] font-bold text-neutral-500 uppercase">
          {isMarketOpen(instrument.type, instrument.symbol) ? <span className="text-emerald-500/60">Abierto</span> : 'Cerrado'}
        </div>

        {/* COLUMNA ACCIÓN (RESTAURADA) */}
        <div className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest min-w-[140px] text-center ${getActionColor(analysis?.action, analysis?.powerScore)}`}>
          {isLoading ? 'Scanning...' : (analysis?.action === ActionType.ENTRAR_AHORA && analysis?.powerScore >= 85 ? (analysis.mainSignal === SignalType.SALE ? 'VENDER' : 'COMPRAR') : (analysis?.action || 'STANDBY'))}
        </div>

        {/* COLUMNA TRADE TRACKER (MIS TRADES) */}
        <div className="w-[180px] flex items-center justify-end pl-4 border-l border-white/5 space-x-3">
            {tradeData.type !== 0 && (
              <div className="flex flex-col items-end space-y-1">
                  <div className={`text-[11px] font-black font-mono px-2 py-0.5 rounded ${pnl && pnl >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                    {pnl && pnl >= 0 ? '+' : ''}{pnl?.toFixed(2)}%
                  </div>
                  <div className="flex flex-col items-end leading-none">
                    <span className="text-[9px] text-white font-bold">In: ${tradeData.entry.toLocaleString()}</span>
                    <span className="text-[8px] text-emerald-500/50 font-bold">TP: ${(tradeData.entry * (tradeData.type === 1 ? 1.01 : 0.99)).toLocaleString()}</span>
                  </div>
              </div>
            )}
            <button 
              onClick={cycleTradeMarker} 
              className={`w-12 h-12 rounded-2xl border transition-all flex items-center justify-center
                ${tradeData.type === 1 ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 
                  tradeData.type === 2 ? 'bg-rose-500 border-rose-400 text-black shadow-[0_0_15px rgba(244,63,94,0.4)]' : 
                  'bg-white/5 border-white/10 text-neutral-800'}`}
            >
              {tradeData.type === 0 ? <span className="text-xl opacity-20">+</span> : 
               tradeData.type === 1 ? <span className="text-2xl">▲</span> : <span className="text-2xl">▼</span>}
            </button>
        </div>
      </div>

      {/* MINIATURA SI EL GRÁFICO ESTÁ ABIERTO */}
        {isChartOpen && (
          <div className="w-full h-48 mt-2 bg-black/60 rounded-2xl border border-sky-500/30 overflow-hidden relative group">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-sky-500 font-black tracking-[.3em] uppercase animate-pulse">Gráfico Activo</span>
                <span className="text-[8px] text-sky-500/40 uppercase mt-1 text-center">Toca el icono 📈 para volver al modo pantalla completa</span>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default memo(InstrumentRow);