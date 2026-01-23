import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Instrument, MultiTimeframeAnalysis, SignalType, ActionType, Timeframe, Strategy, Candlestick } from '../types';
import { fetchTimeSeries, PriceStore, resampleCandles, fetchCryptoPrice, isMarketOpen } from '../services/twelveDataService';

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
  const [analysis, setAnalysis] = useState<MultiTimeframeAnalysis | null>(() => {
    return GlobalAnalysisCache[instrument.id]?.analysis || null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  // --- CAMBIO QUIRÚRGICO: Trade Tracker con P&L ---
  useEffect(() => {
    // Ya no pedimos datos cada 15s. El precio se actualizará 
    // automáticamente cuando el Radar haga su refresco global (cada 5 min).
    if (PriceStore[instrument.symbol]) {
      setCurrentPrice(PriceStore[instrument.symbol]);
    }
  }, [analysis]); // Se actualiza solo cuando hay nuevo análisis

  const [tradeData, setTradeData] = useState<{type: number, entry: number}>(() => {
    const saved = localStorage.getItem(`trade_data_${instrument.id}`);
    return saved ? JSON.parse(saved) : { type: 0, entry: 0 };
  });

  const cycleTradeMarker = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTradeData(prev => {
      const nextType = (prev.type + 1) % 3; // 0:Nada, 1:Compra, 2:Venta
      const newData = { type: nextType, entry: nextType !== 0 ? (currentPrice || analysis?.price || 0) : 0 };
      localStorage.setItem(`trade_data_${instrument.id}`, JSON.stringify(newData));
      return newData;
    });
  };

  const pnl = (tradeData.type !== 0 && (currentPrice || analysis?.price) && tradeData.entry) 
    ? (tradeData.type === 1 ? ((currentPrice || analysis?.price || 0) - tradeData.entry) : (tradeData.entry - (currentPrice || analysis?.price || 0))) / tradeData.entry * 100 
    : null;

  const lastActionRef = useRef<ActionType | null>(null);
  const lastRefreshTriggerRef = useRef<number>(GlobalAnalysisCache[instrument.id]?.trigger ?? -1);

  useEffect(() => {
    const interval = setInterval(() => {
      if (instrument.type === 'crypto') {
        fetchCryptoPrice(instrument.symbol);
      }
      if (PriceStore[instrument.symbol]) {
        setCurrentPrice(PriceStore[instrument.symbol]);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [instrument.symbol, instrument.type]);

  const toggleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBookmarked(prev => {
      const newState = !prev;
      const saved = localStorage.getItem('bookmarks');
      let list = saved ? JSON.parse(saved) : [];
      if (newState) {
        if (!list.includes(instrument.id)) list.push(instrument.id);
      } else {
        list = list.filter((id: string) => id !== instrument.id);
      }
      localStorage.setItem('bookmarks', JSON.stringify(list));
      return newState;
    });
  };

  const playAlertSound = useCallback((type: 'entry' | 'exit') => {
    try {
      const vol = parseFloat(localStorage.getItem('alertVolume') || '0.5');
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      if (type === 'entry') {
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.2);
      } else {
        oscillator.frequency.setValueAtTime(660, audioCtx.currentTime);
        oscillator.frequency.linearRampToValueAtTime(330, audioCtx.currentTime + 0.3);
      }
      gainNode.gain.setValueAtTime(vol * 0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {}
  }, []);

  const performAnalysis = useCallback(async () => {
    if (isTestMode) {
      setIsLoading(true);
      await new Promise(r => setTimeout(r, 1000));
      const testResult: MultiTimeframeAnalysis = {
        symbol: instrument.symbol,
        price: 1234.56,
        signals: { '4h': SignalType.BUY, '1h': SignalType.BUY, '15min': SignalType.BUY, '5min': SignalType.BUY },
        action: ActionType.ENTRAR_AHORA,
        mainSignal: SignalType.BUY,
        lastUpdated: Date.now(),
        powerScore: 95
      };
      setAnalysis(testResult);
      setCurrentPrice(1234.56);
      playAlertSound('entry');
      setIsLoading(false);
      return;
    }

    if (isLoading) return;
    setIsLoading(true);
    
    try {
      const data5m = await fetchTimeSeries(instrument.symbol, '5min', 5000);
      
      if (data5m.length >= 100) {
        const combinedData: Partial<Record<Timeframe, Candlestick[]>> = {
          '5min': data5m,
          '15min': resampleCandles(data5m, 3),
          '1h': resampleCandles(data5m, 12),
          '4h': resampleCandles(data5m, 48)
        };

        const result = strategy.analyze(instrument.symbol, combinedData as any, false, instrument);
        
        if (result.action === ActionType.ENTRAR_AHORA && lastActionRef.current !== ActionType.ENTRAR_AHORA) {
          playAlertSound('entry');
        } else if (result.action === ActionType.SALIR && lastActionRef.current !== ActionType.SALIR) {
          playAlertSound('exit');
        }
        
        lastActionRef.current = result.action;
        setAnalysis(result);
        GlobalAnalysisCache[instrument.id] = { analysis: result, trigger: globalRefreshTrigger };
        if (onAnalysisUpdate) onAnalysisUpdate(instrument.id, result);
      }
    } catch (err) {
      console.error(`Error ${instrument.symbol}:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [instrument, strategy, onAnalysisUpdate, playAlertSound, isTestMode, globalRefreshTrigger]);

  useEffect(() => { 
    if (isTestMode) {
      performAnalysis();
      return;
    }
    
    const cached = GlobalAnalysisCache[instrument.id];
    if (globalRefreshTrigger !== lastRefreshTriggerRef.current || !cached) {
      lastRefreshTriggerRef.current = globalRefreshTrigger;
      performAnalysis();
    } else if (cached && !analysis) {
      setAnalysis(cached.analysis);
    }
  }, [globalRefreshTrigger, performAnalysis, isTestMode, instrument.id]);

  const getActionColor = (action?: ActionType, score: number = 0, mainSignal?: SignalType) => {
    if (isLoading) return 'text-neutral-700 border-white/5';
    if (action === ActionType.MERCADO_CERRADO) return 'text-neutral-500 bg-black/40 border-neutral-800/50';
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
        if (mainSignal === SignalType.SALE) return 'text-rose-400 bg-rose-500/20 border-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.4)] scale-105 precision-alert-blink font-black ring-1 ring-rose-500/50';
        return 'text-emerald-400 bg-emerald-500/20 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.4)] scale-105 precision-alert-blink font-black ring-1 ring-emerald-500/50';
    }
    switch(action) {
      case ActionType.SALIR: return 'text-rose-400 bg-rose-500/20 border-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.4)] font-black precision-alert-blink ring-1 ring-rose-500/50';
      case ActionType.ESPERAR: return 'text-amber-400 bg-amber-500/10 border-amber-400/50';
      default: return 'text-neutral-500 bg-white/5 border-white/5';
    }
  };

  const getActionText = (action?: ActionType, score: number = 0, mainSignal?: SignalType) => {
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
      return mainSignal === SignalType.SALE ? 'VENDER' : 'COMPRAR';
    }
    if (action === ActionType.MERCADO_CERRADO) return '🔒 CERRADO';
    return action || 'STANDBY';
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-neutral-600';
  };

  const getSignalDotColor = (tf: Timeframe) => {
    if (isLoading || !analysis || !analysis.signals) return 'bg-neutral-800';
    const sig = analysis.signals[tf];
    if (sig === SignalType.BUY) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
    if (sig === SignalType.SALE) return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]';
    return 'bg-neutral-800';
  };

  const marketOpen = isMarketOpen(instrument.type, instrument.symbol);

  return (
    <div className={`flex flex-col md:flex-row items-center justify-between p-3 rounded-2xl border transition-all duration-500 
      bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.3)]`}>
      
      <div className="flex items-center justify-center w-24">
        <div 
          className="h-7 w-12 rounded-full transition-all duration-300 flex items-center p-1 bg-neutral-800 border border-white/5"
        >
          <div className={`h-5 w-5 rounded-full shadow-lg transition-all duration-500 ${isLoading ? 'bg-amber-500 animate-pulse' : (!marketOpen ? 'bg-neutral-600 translate-x-0' : 'bg-emerald-500 translate-x-5 shadow-[0_0_10px_rgba(16,185,129,0.5)]')}`} />
        </div>
      </div>

      <div className="flex flex-col w-full md:w-1/4">
        <div className="flex items-center space-x-2">
          <div className="flex flex-col">
            <span className="font-mono font-bold text-white text-lg tracking-tight">{instrument.symbol}</span>
            <span className="text-[9px] text-neutral-500 font-medium leading-none mt-0.5">{instrument.name}</span>
          </div>
          <button 
            onClick={() => onOpenChart?.(instrument.symbol)}
            className="p-1.5 hover:bg-emerald-500/20 rounded-lg transition-colors group cursor-pointer"
            title="Abrir Gráfico"
          >
            <svg className="w-4 h-4 text-neutral-500 group-hover:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </button>
          {currentPrice > 0 && <span className="text-[13px] font-mono text-white/90 font-bold ml-auto">${currentPrice.toLocaleString()}</span>}
        </div>
        <span className="text-[8px] text-neutral-600 font-black uppercase tracking-widest">{instrument.type}</span>
      </div>

      <div className="flex space-x-6 w-full md:w-1/3 justify-center">
        {(['4h', '1h', '15min', '5min'] as Timeframe[]).map(tf => (
          <div key={tf} className="flex flex-col items-center">
            <span className="text-[7px] text-neutral-500 font-bold mb-1 uppercase">{tf}</span>
            <div className={`h-2 w-8 rounded-full transition-all duration-700 ${getSignalDotColor(tf)}`}></div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center w-full md:w-1/6">
        <span className={`text-xl font-mono font-black ${getScoreColor(analysis?.powerScore || 0)}`}>
            {isLoading ? '---' : `${analysis?.powerScore || 0}`}
        </span>
        <span className="text-[7px] text-neutral-700 font-bold uppercase tracking-tighter">Power Score</span>
      </div>

      <div className="flex flex-col items-center justify-center w-40 text-center">
        {marketOpen ? (
          <span className="text-[11px] font-black uppercase text-emerald-500 tracking-wider drop-shadow-[0_0_5px_rgba(52,211,153,0.3)]">ABIERTO</span>
        ) : (
          <span className="text-[11px] font-black uppercase text-neutral-600 tracking-wider">CERRADO</span>
        )}
      </div>

      {/* SECCIÓN DE ACCIÓN (SISTEMA) */}
      <div className={`px-5 py-2 rounded-xl border text-[10px] font-black uppercase tracking-[0.25em] min-w-[150px] text-center transition-all duration-500 ${getActionColor(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}`}>
        {isLoading ? (
          <div className="flex items-center justify-center space-x-2">
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></span>
            <span>SCANNING</span>
          </div>
        ) : getActionText(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}
      </div>

      {/* --- NUEVA COLUMNA: TRADE TRACKER --- */}
      <div className="flex items-center ml-10 pl-6 border-l border-white/5 min-w-[140px]">
        <button 
          onClick={cycleTradeMarker}
          className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 border mr-4
            ${tradeData.type === 1 ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 
              tradeData.type === 2 ? 'bg-rose-500/20 border-rose-500/50 text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.2)]' : 
              'bg-white/5 border-white/5 text-neutral-800 hover:text-neutral-600'}`}
        >
          {tradeData.type === 0 ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 4.5v15m7.5-7.5h-15" /></svg> : 
           tradeData.type === 1 ? <svg className="w-6 h-6 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l-8 8h5v8h6v-8h5z" /></svg> : 
                                  <svg className="w-6 h-6 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 20l8-8h-5v-8h-6v8h-5z" /></svg>}
        </button>

        {tradeData.type !== 0 && (
          <div className="flex flex-col">
            <span className={`text-[11px] font-mono font-black ${pnl && pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {pnl && pnl >= 0 ? '+' : ''}{pnl?.toFixed(2)}%
            </span>
            <span className="text-[7px] text-neutral-600 font-bold uppercase tracking-widest">Entry: ${tradeData.entry.toLocaleString()}</span>
            <span className="text-[7px] text-emerald-500/40 font-bold">TP (1%): ${(tradeData.entry * (tradeData.type === 1 ? 1.01 : 0.99)).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(InstrumentRow);