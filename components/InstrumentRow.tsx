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
        // --- RESTAURACIÓN QUIRÚRGICA DEL AUDIO Y ETIQUETA NOW ---
        const result = strategy.analyze(instrument.symbol, combinedData as any, false, instrument);
        
        // Detectamos si la señal es nueva respecto al ciclo anterior
        if (result.action !== lastActionRef.current) {
          // 1. Si la señal es COMPRAR/VENDER y tiene fuerza, suena 'entry'
          if (result.action === ActionType.ENTRAR_AHORA && result.powerScore >= 85) {
            playAlertSound('entry');
            setIsFresh(true); // Activa etiqueta NOW
          } 
          // 2. Si la señal es SALIR, suena 'exit'
          else if (result.action === ActionType.SALIR) {
            playAlertSound('exit');
            setIsFresh(true); // Activa etiqueta NOW
          } else {
            setIsFresh(false);
          }
        } else {
          // Si en el refresco la señal sigue siendo la misma, quitamos el "NOW"
          setIsFresh(false);
        }

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
        {/* --- RESTAURACIÓN QUIRÚRGICA: INDICADOR STATUS (SWITCH) --- */}
      <div className="flex items-center justify-center w-24">
        <div 
          className="h-7 w-12 rounded-full transition-all duration-300 flex items-center p-1 bg-neutral-800 border border-white/5"
        >
          <div className={`h-5 w-5 rounded-full shadow-lg transition-all duration-500 
            ${isLoading ? 'bg-amber-500 animate-pulse' : 
            (!isMarketOpen(instrument.type, instrument.symbol) ? 'bg-neutral-600 translate-x-0' : 
            'bg-emerald-500 translate-x-5 shadow-[0_0_10px_rgba(16,185,129,0.5)]')}`} 
          />
        </div>
      </div>

        {/* COLUMNA INSTRUMENT: ICONOS + PRECIO RECUPERADO (QUIRÚRGICO) */}
        <div className="w-1/4 flex flex-col">
          <div className="flex items-center space-x-3">
            {/* Contenedor de Iconos (Mantiene lingotes, banderas, etc.) */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-[#0a0b0e] border border-white/5 flex items-center justify-center">
              {(() => {
                const sym = instrument.symbol.toUpperCase().replace('/', '');
                if (sym.includes('XAU') || sym.includes('GOLD')) return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FFB100"><path d="M2 22h20v-2H2v2zm3-4h6v-2H5v2zm8 0h6v-2h-6v2zM2 16h9v-2H2v2zm11 0h9v-2h-9v2zM5 10h6V8H5v2zm8 0h6V8h-6v2zM2 8h9V6H2v2zm11 0h9V6h-9v2z"/></svg>;
                if (sym.includes('XAG') || sym.includes('SILVER')) return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#A6A9B6"><path d="M2 22h20v-2H2v2zm3-4h6v-2H5v2zm8 0h6v-2h-6v2zM2 16h9v-2H2v2zm11 0h9v-2h-9v2zM5 10h6V8H5v2zm8 0h6V8h-6v2zM2 8h9V6H2v2zm11 0h9V6h-9v2z"/></svg>;
                if (sym.includes('OIL') || sym.includes('WTI')) return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#000"><path d="M12 2.25L6.44 7.64c-2.14 2.14-3.19 4.96-3.19 7.76 0 4.8 3.84 8.7 8.75 8.7s8.75-3.9 8.75-8.7c0-2.8-1.05-5.62-3.19-7.76l-4.92-5.11z" stroke="#fff" strokeWidth="0.5"/></svg>;
                if (sym.includes('500') || sym.includes('SPX')) return <div className="w-full h-full bg-[#FF0000] flex items-center justify-center text-[10px] font-bold text-white">500</div>;
                if (sym.includes('30') || sym.includes('DJI')) return <div className="w-full h-full bg-[#0052FF] flex items-center justify-center text-[10px] font-bold text-white">30</div>;
                if (sym.includes('100') || sym.includes('NDX')) return <div className="w-full h-full bg-[#00BCD4] flex items-center justify-center text-[10px] font-bold text-white">100</div>;
                if (instrument.type === 'forex' && instrument.symbol.includes('/')) {
                  const parts = instrument.symbol.split('/');
                  return (
                    <div className="flex -space-x-2">
                      <img src={`https://flagcdn.com/w40/${parts[0].substring(0,2).toLowerCase()}.png`} className="w-5 h-5 rounded-full object-cover border border-black" alt="" />
                      <img src={`https://flagcdn.com/w40/${parts[1].substring(0,2).toLowerCase()}.png`} className="w-5 h-5 rounded-full object-cover border border-black" alt="" />
                    </div>
                  );
                }
                return <img src={instrument.type === 'crypto' ? `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${sym.substring(0,3).toLowerCase()}.png` : `https://s3-symbol-logo.tradingview.com/${sym}.svg`} className="w-full h-full object-contain p-1" onError={(e) => { e.currentTarget.style.display='none'; if(e.currentTarget.parentElement) e.currentTarget.parentElement.innerHTML=`<span class=\"text-[10px] font-bold text-neutral-500\">${sym.charAt(0)}</span>`; }} alt="" />;
              })()}
            </div>

            {/* SYMBOL INFO + PRECIO (EL PRECIO HA VUELTO) */}
            <div className="flex flex-col flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-white text-lg tracking-tight">{instrument.symbol}</span>
                  {isFresh && <span className="px-1.5 py-0.5 rounded bg-sky-500 text-black text-[9px] font-black animate-pulse">NOW</span>}
                  
                  {/* Botón de Gráfico con Estado */}
                  <button 
                    onClick={() => onOpenChart?.(instrument.symbol)} 
                    className={`p-1.5 rounded-lg transition-all duration-300 border
                      ${isChartOpen 
                        ? 'bg-sky-500/20 border-sky-500/50 text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.3)]' 
                        : 'bg-white/5 border-white/5 text-neutral-500 hover:text-sky-400'}`}
                  >
                    📈
                  </button>
                </div>

                {/* EL PRECIO ESTÁ AQUÍ OTRA VEZ */}
                {currentPrice > 0 && (
                  <span className="text-[14px] font-mono text-white font-black tracking-tighter">
                    ${currentPrice.toLocaleString()}
                  </span>
                )}
              </div>
              <span className="text-[9px] text-neutral-500 uppercase tracking-widest leading-none mt-0.5">{instrument.name}</span>
            </div>
          </div>
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

        {/* --- TRADE TRACKER RESTAURADO Y MEJORADO (DISEÑO PRO) --- */}
        <div className="w-[200px] flex items-center justify-end pl-4 border-l border-white/5 space-x-4">
          
          {tradeData.type !== 0 && (
            <div className="flex flex-col items-end space-y-1.5">
                {/* Badge de Porcentaje con mejor legibilidad */}
                <div className={`text-[12px] font-black font-mono px-2 py-0.5 rounded-md leading-none shadow-sm
                  ${pnl && pnl >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                  {pnl && pnl >= 0 ? '+' : ''}{pnl?.toFixed(2)}%
                </div>
                
                {/* Datos de Entrada y TP con mejor contraste */}
                <div className="flex flex-col items-end gap-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-tighter">In:</span>
                    <span className="text-[11px] font-mono font-bold text-white/90 tracking-tight">${tradeData.entry.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-emerald-500/40 font-bold uppercase tracking-tighter">TP:</span>
                    <span className="text-[11px] font-mono font-bold text-emerald-500/70 tracking-tight">
                      ${(tradeData.entry * (tradeData.type === 1 ? 1.01 : 0.99)).toLocaleString()}
                    </span>
                  </div>
                </div>
            </div>
          )}

          {/* Botón de Marcador con Flecha Animada (SVG) */}
          <button 
            onClick={cycleTradeMarker} 
            className={`w-12 h-12 rounded-2xl border-2 transition-all duration-300 flex items-center justify-center
              ${tradeData.type === 1 ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 
                tradeData.type === 2 ? 'bg-rose-500 border-rose-400 text-black shadow-[0_0_20px_rgba(244,63,94,0.5)]' : 
                'bg-white/5 border-white/10 text-neutral-800 hover:text-neutral-500 hover:bg-white/10'}`}
          >
            {tradeData.type === 0 ? (
              <svg className="w-5 h-5 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            ) : tradeData.type === 1 ? (
              <svg className="w-8 h-8 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 4l-8 8h5v8h6v-8h5z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 20l8-8h-5v-8h-6v8h-5z" />
              </svg>
            )}
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