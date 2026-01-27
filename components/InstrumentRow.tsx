import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Instrument, MultiTimeframeAnalysis, SignalType, ActionType, Timeframe, Strategy, Candlestick } from '../types';
import { fetchTimeSeries, PriceStore, resampleCandles, isMarketOpen } from '../services/marketDataService';

const GlobalAnalysisCache: Record<string, { analysis: MultiTimeframeAnalysis, trigger: number }> = {};

interface InstrumentRowProps {
  instrument: Instrument;
  index: number;
  globalRefreshTrigger: number;
  strategy: Strategy;
  onAnalysisUpdate?: (id: string, data: MultiTimeframeAnalysis | null) => void;
  onOpenChart?: (symbol: string) => void;
  isChartOpen?: boolean;
}

const InstrumentRow: React.FC<InstrumentRowProps> = ({ 
  instrument, index, globalRefreshTrigger, strategy, onAnalysisUpdate, onOpenChart, isChartOpen
}) => {
  const [isFresh, setIsFresh] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  
  // EFECTO BOOM: Leer de caché o localStorage al arrancar (Carga instantánea)
  const [analysis, setAnalysis] = useState<MultiTimeframeAnalysis | null>(() => {
    if (GlobalAnalysisCache[instrument.id]) return GlobalAnalysisCache[instrument.id].analysis;
    const saved = localStorage.getItem(`last_analysis_${instrument.id}`);
    if (saved) {
      const cached = JSON.parse(saved);
      const diezMinutos = 10 * 60 * 1000;
      if (Date.now() - cached.timestamp < diezMinutos) return cached.analysis;
    }
    return null;
  });

  const [tradeData, setTradeData] = useState<{type: number, entry: number}>(() => {
    const saved = localStorage.getItem(`trade_data_${instrument.id}`);
    return saved ? JSON.parse(saved) : { type: 0, entry: 0 };
  });

  const lastActionRef = useRef<ActionType | null>(null);
  const lastRefreshTriggerRef = useRef<number>(-1);

  const playAlertSound = useCallback((type: 'entry' | 'exit') => {
    try {
      const vol = parseFloat(localStorage.getItem('alertVolume') || '0.5');
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(type === 'entry' ? 440 : 660, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(type === 'entry' ? 880 : 330, audioCtx.currentTime + 0.2);
      gain.gain.setValueAtTime(vol * 0.1, audioCtx.currentTime);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {}
  }, []);

  const performAnalysis = useCallback(async () => {
    console.log("[RADAR] performAnalysis RUN", instrument.symbol, Date.now());
    if (isLoading) return;
    setIsLoading(true);
    try {
      const data5m = await fetchTimeSeries(instrument.symbol, '5min');
      console.log(instrument.symbol, "5m candles:", data5m.length, "last dt:", data5m.at(-1)?.datetime);
      
      if (data5m.length >= 144) {
        const combinedData = {
          '5min': data5m, 
          '15min': resampleCandles(data5m, 3),
          '1h': resampleCandles(data5m, 12), 
          '4h': resampleCandles(data5m, 48)
        };
        
        const result = strategy.analyze(instrument.symbol, combinedData as any, false, instrument);
        console.log(instrument.symbol, "signals:", result.signals, "score:", result.powerScore, "action:", result.action);
        
        if (result.action !== lastActionRef.current) {
          if (result.action === ActionType.ENTRAR_AHORA && result.powerScore >= 85) {
            playAlertSound('entry'); setIsFresh(true);
          } else if (result.action === ActionType.SALIR) {
            playAlertSound('exit'); setIsFresh(true);
          }
        } else { setIsFresh(false); }

        lastActionRef.current = result.action;
        setAnalysis(result);
        
        // Guardar en caché y disco (Persistencia)
        GlobalAnalysisCache[instrument.id] = { analysis: result, trigger: globalRefreshTrigger };
        console.log("[RADAR] saving analysis", instrument.id);
        localStorage.setItem(`last_analysis_${instrument.id}`, JSON.stringify({
          analysis: result, timestamp: Date.now()
        }));

        if (onAnalysisUpdate) onAnalysisUpdate(instrument.id, result);
      }
    } catch (e) {
      console.error("Analysis Error:", e);
    } finally { setIsLoading(false); }
  }, [instrument, strategy, globalRefreshTrigger, playAlertSound, onAnalysisUpdate, isLoading]);

  // DISPARO AL MONTAR: Ejecuta análisis una vez al cargar (independiente del trigger)
  useEffect(() => {
    const timer = setTimeout(() => {
      performAnalysis();
    }, index * 25); // Stagger para evitar saturar Supabase
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (globalRefreshTrigger !== lastRefreshTriggerRef.current) {
      const isFirstLoad = lastRefreshTriggerRef.current === -1;
      lastRefreshTriggerRef.current = globalRefreshTrigger;
      // Delay mínimo: Supabase aguanta carga simultánea
      const staggerDelay = isFirstLoad ? (index * 25) : (index * 10);
      const timer = setTimeout(() => {
        performAnalysis();
      }, staggerDelay);
      return () => clearTimeout(timer);
    }
  }, [globalRefreshTrigger, performAnalysis, index]);

  useEffect(() => {
    const rawPrice = PriceStore[instrument.symbol] || analysis?.price;
    if (rawPrice) setCurrentPrice(typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice);
  }, [analysis, instrument.symbol]);

  const getActionText = (action?: ActionType, score: number = 0, mainSignal?: SignalType) => {
    if (action === ActionType.ENTRAR_AHORA && score >= 85) return mainSignal === SignalType.SALE ? 'VENDER' : 'COMPRAR';
    if (action === ActionType.MERCADO_CERRADO) return '🔒 CERRADO';
    return action || 'STANDBY';
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
      const newData = { type: nextType, entry: nextType !== 0 ? (currentPrice || 0) : 0 };
      localStorage.setItem(`trade_data_${instrument.id}`, JSON.stringify(newData));
      return newData;
    });
  };

  const pnl = (tradeData.type !== 0 && tradeData.entry > 0 && currentPrice > 0) ? (tradeData.type === 1 ? (currentPrice - tradeData.entry) : (tradeData.entry - currentPrice)) / tradeData.entry * 100 : null;

  const getActionColor = (action?: ActionType, score: number = 0, mainSignal?: SignalType) => {
    if (isLoading) return 'text-neutral-700 border-white/5';
    if (action === ActionType.MERCADO_CERRADO) return 'text-neutral-500 bg-black/40 border-neutral-800/50';
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
      return mainSignal === SignalType.SALE 
        ? 'text-rose-400 bg-rose-500/20 border-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.4)] precision-alert-blink font-black ring-1 ring-rose-500/50'
        : 'text-emerald-400 bg-emerald-500/20 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.4)] precision-alert-blink font-black ring-1 ring-emerald-500/50';
    }
    switch(action) {
      case ActionType.SALIR: return 'text-rose-400 bg-rose-500/20 border-rose-400 precision-alert-blink';
      case ActionType.ESPERAR: return 'text-amber-400 bg-amber-500/10 border-amber-400/30';
      default: return 'text-neutral-500 bg-white/5 border-white/5';
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-2xl border bg-white/[0.03] border-white/5 hover:bg-white/[0.05] transition-all duration-300">
      <div className="flex flex-row items-center justify-between w-full">
        <div className="w-24 flex justify-center">
            <div className="h-7 w-12 rounded-full transition-all duration-300 flex items-center p-1 bg-neutral-800 border border-white/5">
              <div className={`h-5 w-5 rounded-full shadow-lg transition-all duration-500 ${isLoading ? 'bg-amber-500 animate-pulse' : (isMarketOpen(instrument.type, instrument.symbol) ? 'bg-emerald-500 translate-x-5 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-neutral-600 translate-x-0')}`} />
            </div>
        </div>

        <div className="w-1/4 flex flex-col">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-[#0a0b0e] border border-white/5 flex items-center justify-center">
              {(() => {
                const sym = instrument.symbol.toUpperCase().replace('/', '');
                if (sym.includes('XAU')) return <span className="text-lg">🟡</span>;
                if (sym.includes('XAG')) return <span className="text-lg">⚪</span>;
                if (sym.includes('OIL') || sym.includes('WTI')) return <span className="text-lg">🛢️</span>;
                if (instrument.type === 'forex' && instrument.symbol.includes('/')) {
                  const pts = instrument.symbol.split('/');
                  return <div className="flex -space-x-2">
                    <img src={`https://flagcdn.com/w40/${pts[0].substring(0,2).toLowerCase()}.png`} className="w-5 h-5 rounded-full object-cover border border-black" alt="" />
                    <img src={`https://flagcdn.com/w40/${pts[1].substring(0,2).toLowerCase()}.png`} className="w-5 h-5 rounded-full object-cover border border-black" alt="" />
                  </div>;
                }
                return <span className="text-[10px] font-bold text-neutral-500">{sym.charAt(0)}</span>;
              })()}
            </div>
            <div className="flex flex-col flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-white text-lg tracking-tight">{instrument.symbol}</span>
                    {isFresh && (
                      <span className="px-1.5 py-0.5 rounded bg-sky-500 text-black text-[9px] font-black animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.5)]">
                        NOW
                      </span>
                    )}
                    <button 
                      onClick={() => onOpenChart?.(instrument.symbol)} 
                      className={`p-1.5 rounded-lg transition-colors duration-300 border flex items-center justify-center ${isChartOpen ? 'bg-sky-500/20 border-sky-500 text-sky-400' : 'bg-white/5 border-white/5 text-neutral-500 hover:text-sky-400'}`}
                    >📈</button>
                  </div>
                {currentPrice > 0 && <span className="text-[14px] font-mono text-white font-black">{currentPrice < 2 ? currentPrice.toFixed(4) : currentPrice.toFixed(2)}</span>}
              </div>
              <span className="text-[14px] text-neutral-500 uppercase mt-0.5">{instrument.name}</span>
            </div>
          </div>
        </div>

        <div className="w-1/3 flex justify-center space-x-6">
          {(['4h', '1h', '15min', '5min'] as Timeframe[]).map(tf => (
            <div key={tf} className="flex flex-col items-center">
              <span className="text-[7px] text-neutral-500 font-bold mb-1 uppercase">{tf}</span>
              <div className={`h-1.5 w-8 rounded-full ${getSignalDotColor(tf)}`} />
            </div>
          ))}
        </div>
        <div className="w-1/6 text-center text-xl font-black font-mono">
          {analysis?.powerScore || 0}
        </div>
        <div className="w-40 text-center text-[10px] font-bold text-neutral-500 uppercase">{isMarketOpen(instrument.type, instrument.symbol) ? 'Abierto' : 'Cerrado'}</div>
        <div className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest min-w-[140px] text-center ${getActionColor(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}`}>
          {isLoading ? 'Scanning...' : getActionText(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}
        </div>

        <div className="w-[200px] flex items-center justify-end pl-4 border-l border-white/5 space-x-3">
          {tradeData.type !== 0 && (
            <div className={`text-[11px] font-black font-mono px-2 py-0.5 rounded ${pnl && pnl >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>{pnl?.toFixed(2)}%</div>
          )}
          <button onClick={cycleTradeMarker} className={`w-12 h-12 rounded-2xl border-2 transition-all flex items-center justify-center ${tradeData.type === 1 ? 'bg-emerald-500 border-emerald-400 text-black' : tradeData.type === 2 ? 'bg-rose-500 border-rose-400 text-black' : 'bg-white/5 text-neutral-800'}`}>
            {tradeData.type === 0 ? '➕' : tradeData.type === 1 ? '▲' : '▼'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(InstrumentRow);