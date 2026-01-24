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
  
  const [tradeData, setTradeData] = useState<{type: number, entry: number}>(() => {
    const saved = localStorage.getItem(`trade_data_${instrument.id}`);
    return saved ? JSON.parse(saved) : { type: 0, entry: 0 };
  });

  const lastActionRef = useRef<ActionType | null>(null);
  const lastRefreshTriggerRef = useRef<number>(GlobalAnalysisCache[instrument.id]?.trigger ?? -1);

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
    if (isLoading) return;
    setIsLoading(true);
    try {
      // RESTAURACIÓN QUIRÚRGICA: 5000 velas como estaba originalmente
      const data5m = await fetchTimeSeries(instrument.symbol, '5min', 5000); 
      if (data5m.length >= 100) {
        const combinedData = {
          '5min': data5m, 
          '15min': resampleCandles(data5m, 3),
          '1h': resampleCandles(data5m, 12), 
          '4h': resampleCandles(data5m, 48)
        };
        
        // LA LÓGICA DE LA ESTRATEGIA NO SE TOCA UN SOLO PIXEL
        const result = strategy.analyze(instrument.symbol, combinedData as any, false, instrument);
        
        if (result.action !== lastActionRef.current) {
          if (result.action === ActionType.ENTRAR_AHORA && result.powerScore >= 85) {
            playAlertSound('entry'); setIsFresh(true);
          } else if (result.action === ActionType.SALIR) {
            playAlertSound('exit'); setIsFresh(true);
          }
        } else { setIsFresh(false); }

        lastActionRef.current = result.action;
        setAnalysis(result);
        GlobalAnalysisCache[instrument.id] = { analysis: result, trigger: globalRefreshTrigger };
        if (onAnalysisUpdate) onAnalysisUpdate(instrument.id, result);
      }
    } catch (e) {
    } finally { setIsLoading(false); }
  }, [instrument, strategy, globalRefreshTrigger, playAlertSound, onAnalysisUpdate]);

  useEffect(() => {
    if (globalRefreshTrigger !== lastRefreshTriggerRef.current) {
      lastRefreshTriggerRef.current = globalRefreshTrigger;
      performAnalysis();
    }
  }, [globalRefreshTrigger, performAnalysis]);

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
    // SI ES ENTRADA FUERTE
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
      // SI ES VENTA -> ROJO + PARPADEO
      if (mainSignal === SignalType.SALE) {
        return 'text-rose-400 bg-rose-500/20 border-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.4)] precision-alert-blink font-black ring-1 ring-rose-500/50';
      }
      // SI ES COMPRA -> VERDE + PARPADEO
      return 'text-emerald-400 bg-emerald-500/20 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.4)] precision-alert-blink font-black ring-1 ring-emerald-500/50';
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
                if (sym.includes('XAU')) return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FFB100"><path d="M2 22h20v-2H2v2zm3-4h6v-2H5v2zm8 0h6v-2h-6v2zM2 16h9v-2H2v2zm11 0h9v-2h-9v2z"/></svg>;
                if (sym.includes('XAG')) return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#A6A9B6"><path d="M2 22h20v-2H2v2zm3-4h6v-2H5v2zm8 0h6v-2h-6v2zM2 16h9v-2H2v2zm11 0h9v-2h-9v2z"/></svg>;
                if (sym.includes('OIL') || sym.includes('WTI')) return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#000"><path d="M12 2.25L6.44 7.64c-2.14 2.14-3.19 4.96-3.19 7.76 0 4.8 3.84 8.7 8.75 8.7s8.75-3.9 8.75-8.7c0-2.8-1.05-5.62-3.19-7.76l-4.92-5.11z" stroke="#fff" strokeWidth="0.5"/></svg>;
                if (sym.includes('500') || sym.includes('SPX')) return <div className="w-full h-full bg-[#FF0000] flex items-center justify-center text-[10px] font-bold text-white">500</div>;
                if (sym.includes('30') || sym.includes('DJI')) return <div className="w-full h-full bg-[#0052FF] flex items-center justify-center text-[10px] font-bold text-white">30</div>;
                if (sym.includes('100') || sym.includes('NDX')) return <div className="w-full h-full bg-[#00BCD4] flex items-center justify-center text-[10px] font-bold text-white">100</div>;
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
                    {/* --- RESTAURACIÓN QUIRÚRGICA: ETIQUETA NOW --- */}
                    {isFresh && (
                      <span className="px-1.5 py-0.5 rounded bg-sky-500 text-black text-[9px] font-black animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.5)]">
                        NOW
                      </span>
                    )}
                    {/* Botón de Gráfico (Mantenido celeste si está abierto) */}
                    <button 
                      onClick={() => onOpenChart?.(instrument.symbol)} 
                      className={`p-1.5 rounded-lg transition-colors duration-300 border flex items-center justify-center ${isChartOpen ? 'bg-sky-500/20 border-sky-500/50 text-sky-400' : 'bg-white/5 border-white/5 text-neutral-500 hover:text-sky-400'}`}
                    >📈</button>
                  </div>
                {currentPrice > 0 && <span className="text-[14px] font-mono text-white font-black">{currentPrice < 2 ? currentPrice.toFixed(4) : currentPrice.toFixed(2)}</span>}
              </div>
              <span className="text-[9px] text-neutral-500 uppercase mt-0.5">{instrument.name}</span>
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
        <div className="w-1/6 text-center">
          <span className={`text-xl font-black font-mono ${analysis?.powerScore && analysis.powerScore >= 85 ? 'text-emerald-400' : 'text-neutral-500'}`}>{analysis?.powerScore || 0}</span>
        </div>
        <div className="w-40 text-center text-[10px] font-bold text-neutral-500 uppercase">{isMarketOpen(instrument.type, instrument.symbol) ? 'Abierto' : 'Cerrado'}</div>
        <div className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest min-w-[140px] text-center ${getActionColor(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}`}>
          {isLoading ? 'Scanning...' : getActionText(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}
        </div>

        <div className="w-[200px] flex items-center justify-end pl-4 border-l border-white/5 space-x-3">
          {tradeData.type !== 0 && (
            <>
              <div className={`text-[11px] font-black font-mono px-2 py-0.5 rounded ${pnl && pnl >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>{pnl?.toFixed(2)}%</div>
              {/* --- BLOQUE DE PRECIOS CON PRECISIÓN TOTAL --- */}
              <div className="flex flex-col items-end leading-none space-y-1">
                {/* Precio de Entrada */}
                <span className="text-[9px] text-white font-bold">
                  In: ${tradeData.entry < 2 
                    ? tradeData.entry.toFixed(4) 
                    : tradeData.entry.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {/* Precio Take Profit (1%) */}
                <span className="text-[8px] text-emerald-500/50 font-bold">
                  TP: ${(() => {
                    const tpValue = tradeData.type === 1 ? tradeData.entry * 1.01 : tradeData.entry * 0.99;
                    return tradeData.entry < 2 
                      ? tpValue.toFixed(4) 
                      : tpValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  })()}
                </span>
              </div>
            </>
          )}
          <button onClick={cycleTradeMarker} className={`w-12 h-12 rounded-2xl border-2 transition-all flex items-center justify-center ${tradeData.type === 1 ? 'bg-emerald-500 border-emerald-400 text-black' : tradeData.type === 2 ? 'bg-rose-500 border-rose-400 text-black' : 'bg-white/5 text-neutral-800'}`}>
            {tradeData.type === 0 ? <svg className="w-5 h-5 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M12 4.5v15m7.5-7.5h-15" /></svg> : 
             tradeData.type === 1 ? <svg className="w-8 h-8 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l-8 8h5v8h6v-8h5z" /></svg> : 
                                    <svg className="w-8 h-8 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 20l8-8h-5v-8h-6v8h-5z" /></svg>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(InstrumentRow);