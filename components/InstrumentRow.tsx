
import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Instrument, MultiTimeframeAnalysis, SignalType, ActionType, Timeframe, Strategy, Candlestick } from '../types';
import { fetchTimeSeries, PriceStore, resampleCandles } from '../services/twelveDataService';

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
  const [isBookmarked, setIsBookmarked] = useState(() => {
    const saved = localStorage.getItem('bookmarks');
    return saved ? JSON.parse(saved).includes(instrument.id) : false;
  });
  
  const lastActionRef = useRef<ActionType | null>(null);
  const lastRefreshTriggerRef = useRef<number>(GlobalAnalysisCache[instrument.id]?.trigger ?? -1);

  useEffect(() => {
    const interval = setInterval(() => {
      if (PriceStore[instrument.symbol]) {
        setCurrentPrice(PriceStore[instrument.symbol]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [instrument.symbol]);

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
      // Cambio crucial: Se solicitan 5000 velas para que el resampling de 4H (48 * velas) tenga historial suficiente
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

  const getActionColor = (action?: ActionType, score: number = 0) => {
    if (isLoading) return 'text-neutral-700 border-white/5';
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
        return 'text-emerald-400 bg-emerald-500/20 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)] scale-105 precision-alert-blink font-black';
    }
    switch(action) {
      case ActionType.SALIR: return 'text-rose-400 bg-rose-500/20 border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)] font-black precision-alert-blink';
      case ActionType.ESPERAR: return 'text-amber-400 bg-amber-500/10 border-amber-400/50';
      default: return 'text-neutral-500 bg-white/5 border-white/5';
    }
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

  return (
    <div className={`flex flex-col md:flex-row items-center justify-between p-2.5 rounded-2xl border transition-all duration-500 
      ${isBookmarked ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.1)]' : 'bg-white/[0.04] border-emerald-500/20'}
      shadow-[0_4px_20px_rgba(0,0,0,0.3)]`}>
      
      <div className="flex items-center justify-center w-24">
        <div 
          className="h-7 w-12 rounded-full transition-all duration-300 flex items-center p-1 bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.4)] cursor-default"
        >
          <div className="h-5 w-5 bg-white rounded-full shadow-lg translate-x-5" />
        </div>
      </div>

      <div className="flex flex-col w-full md:w-1/4">
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => onOpenChart?.(instrument.symbol)}
            className="font-mono font-bold text-white text-md tracking-tight hover:text-emerald-500 transition-colors cursor-pointer text-left"
          >
            {instrument.symbol}
          </button>
          {currentPrice > 0 && <span className="text-[10px] font-mono text-emerald-500/80">${currentPrice.toLocaleString()}</span>}
        </div>
        <span className="text-[8px] text-neutral-600 font-black uppercase tracking-widest">{instrument.type}</span>
      </div>

      <div className="flex space-x-6 w-full md:w-1/3 justify-center">
        {(['4h', '1h', '15min', '5min'] as Timeframe[]).map(tf => (
          <div key={tf} className="flex flex-col items-center">
            <span className="text-[7px] text-neutral-500 font-bold mb-0.5 uppercase">{tf}</span>
            <div className={`h-1.5 w-8 rounded-full ${getSignalDotColor(tf)}`}></div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center w-full md:w-1/6">
        <span className={`text-lg font-mono font-black ${getScoreColor(analysis?.powerScore || 0)}`}>
            {isLoading ? '--' : `${analysis?.powerScore || 0}/100`}
        </span>
      </div>

      <div className={`px-4 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-[0.2em] min-w-[140px] text-center transition-all duration-500 ${getActionColor(analysis?.action, analysis?.powerScore)}`}>
        {isLoading ? 'SCANNING' : (analysis?.action || 'STANDBY')}
      </div>

      <div className="w-10 flex justify-center items-center">
        <button 
          onClick={toggleBookmark}
          className={`transition-all duration-300 transform hover:scale-110 ${isBookmarked ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'text-neutral-800 hover:text-neutral-600'}`}
        >
          <svg className="w-5 h-5" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default memo(InstrumentRow);
