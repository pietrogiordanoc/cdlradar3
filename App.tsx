
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ALL_INSTRUMENTS, REFRESH_INTERVAL_MS } from './constants.tsx';
import { STRATEGIES } from './utils/tradingLogic';
import { MultiTimeframeAnalysis } from './types';
import InstrumentRow from './components/InstrumentRow';
import TimerDonut from './components/TimerDonut';
import TradingViewModal from './components/TradingViewModal';

type SortConfig = { key: 'symbol' | 'action' | 'signal' | 'price'; direction: 'asc' | 'desc' } | null;

const App: React.FC = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [filter, setFilter] = useState<'all' | 'forex' | 'indices' | 'stocks' | 'commodities' | 'crypto'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [volume, setVolume] = useState(0.5);
  const [isTestActive, setIsTestActive] = useState(false);
  const [selectedChartSymbol, setSelectedChartSymbol] = useState<string | null>(null);
  
  const analysesRef = useRef<Record<string, MultiTimeframeAnalysis>>({});
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    localStorage.setItem('alertVolume', volume.toString());
  }, [volume]);

  const handleTestAlerts = () => {
    setIsTestActive(true);
    setTimeout(() => setIsTestActive(false), 10000);
  };

  const playPreviewSound = (type: 'entry' | 'exit') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      if(type === 'entry') {
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.2);
      } else {
        oscillator.frequency.setValueAtTime(660, audioCtx.currentTime);
        oscillator.frequency.linearRampToValueAtTime(330, audioCtx.currentTime + 0.3);
      }
      gainNode.gain.setValueAtTime(volume * 0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {}
  };

  const handleAnalysisUpdate = useCallback((id: string, data: MultiTimeframeAnalysis | null) => {
    if (!data) return;
    analysesRef.current[id] = data;
    if (sortConfig && (sortConfig.key === 'price' || sortConfig.key === 'action')) {
      forceUpdate(t => t + 1);
    }
  }, [sortConfig]);

  const requestSort = (key: 'symbol' | 'action' | 'signal' | 'price') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredInstruments = useMemo(() => {
    let items = ALL_INSTRUMENTS;
    if (filter !== 'all') items = items.filter(i => i.type === filter);
    if (searchQuery) items = items.filter(i => i.symbol.toLowerCase().includes(searchQuery.toLowerCase()));
    const currentAnalyses = analysesRef.current;
    return [...items].sort((a, b) => {
      if (sortConfig) {
        const { key, direction } = sortConfig;
        let valA: any, valB: any;
        if (key === 'symbol') { valA = a.symbol; valB = b.symbol; }
        else if (key === 'price') { valA = currentAnalyses[a.id]?.price || 0; valB = currentAnalyses[b.id]?.price || 0; }
        else if (key === 'action') { valA = currentAnalyses[a.id]?.action || ''; valB = currentAnalyses[b.id]?.action || ''; }
        else if (key === 'signal') { valA = currentAnalyses[a.id]?.mainSignal || ''; valB = currentAnalyses[b.id]?.mainSignal || ''; }
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filter, searchQuery, sortConfig]);

  return (
    <div className="min-h-screen pb-24 bg-[#050505] text-white selection:bg-emerald-500/30">
      <header className="sticky top-0 z-50 bg-[#050505]/95 backdrop-blur-2xl border-b border-white/5 px-8 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex items-center space-x-6">
            <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.05)]">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight leading-none text-white">CDLRADAR <span className="text-emerald-500">V4.2</span></h1>
              <div className="flex items-center space-x-2 mt-2">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-500"></span>
                <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-[0.3em]">
                  {ALL_INSTRUMENTS.length} ACTIVE TERMINALS
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-8">
            <div className="hidden xl:flex items-center space-x-8 px-8 py-2 border-l border-white/10">
              <div className="flex flex-col">
                <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-2">Trader Guide</span>
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                    <span className="text-[12px] font-mono font-bold text-emerald-400">85+ ENTRY</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                    <span className="text-[12px] font-mono font-bold text-amber-400">60+ WAIT</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center space-y-2 ml-4">
                <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Alert Settings</span>
                <div className="flex items-center space-x-3 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                  <div className="flex flex-col space-y-1">
                    <button onClick={() => playPreviewSound('entry')} className="text-[8px] font-black text-emerald-500 hover:text-emerald-400 uppercase">Entry</button>
                    <button onClick={() => playPreviewSound('exit')} className="text-[8px] font-black text-rose-500 hover:text-rose-400 uppercase">Exit</button>
                  </div>
                  <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-20 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                </div>
              </div>
            </div>

            <button 
              onClick={handleTestAlerts}
              className={`px-4 py-2 border ${isTestActive ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'} text-[10px] font-black uppercase tracking-widest rounded-lg transition-all`}
            >
              {isTestActive ? 'TESTING...' : 'TEST SIGNAL'}
            </button>

            <TimerDonut durationMs={REFRESH_INTERVAL_MS} onComplete={() => setRefreshTrigger(t => t + 1)} isPaused={false} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 mt-12">
        {isTestActive && (
          <div className="mb-10 animate-bounce">
             <InstrumentRow 
               instrument={ALL_INSTRUMENTS[0]} 
               isConnected={true} 
               isTestMode={true}
               onToggleConnect={() => {}} 
               globalRefreshTrigger={0} 
               strategy={STRATEGIES[0]} 
             />
             <p className="text-center text-emerald-500 text-[10px] font-black uppercase tracking-widest mt-4">DEMO SIGNAL: VISUAL & AUDIO TEST</p>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 bg-white/[0.02] p-6 rounded-3xl border border-white/5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-3">
            {(['all', 'forex', 'indices', 'stocks', 'commodities', 'crypto'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${filter === f ? 'bg-emerald-500 text-black shadow-[0_0_25px_rgba(16,185,129,0.25)]' : 'bg-white/5 text-neutral-500 hover:text-white border border-white/5 hover:bg-white/10'}`}>{f}</button>
            ))}
          </div>
          <div className="relative w-full md:w-96">
            <input type="text" placeholder="BUSCAR SÍMBOLO..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-14 pr-6 py-4 bg-black border border-white/10 rounded-2xl text-[13px] font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder:text-neutral-700" />
            <svg className="absolute left-5 top-4.5 w-6 h-6 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        <div className="flex items-center justify-between px-8 mb-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-neutral-600 border-b border-white/5">
           <div className="w-24 text-center">STATUS</div>
           <div className="w-1/4 cursor-pointer hover:text-emerald-500 transition-colors" onClick={() => requestSort('symbol')}>Instrumento {sortConfig?.key === 'symbol' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
           <div className="w-1/3 text-center">MTF Context Alignment</div>
           <div className="w-1/6 text-center">Power Score</div>
           <div className="w-1/5 text-center cursor-pointer hover:text-emerald-500 transition-colors" onClick={() => requestSort('action')}>Recommendation</div>
           <div className="w-10 text-center">SAVE</div>
        </div>

        <div className="space-y-4 pb-20">
          {filteredInstruments.map(inst => (
            <InstrumentRow
              key={inst.id}
              instrument={inst}
              isConnected={true}
              onToggleConnect={() => {}}
              globalRefreshTrigger={refreshTrigger}
              strategy={STRATEGIES[0]}
              onAnalysisUpdate={handleAnalysisUpdate}
              onOpenChart={setSelectedChartSymbol}
            />
          ))}
        </div>
      </main>

      {selectedChartSymbol && (
        <TradingViewModal 
          symbol={selectedChartSymbol} 
          onClose={() => setSelectedChartSymbol(null)} 
        />
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-3xl border-t border-white/5 py-5 px-10 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 z-50">
        <div className="flex items-center space-x-10">
          <span className="text-emerald-500 flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
            <span>DATA FLOW ACTIVE - RESAMPLING MODE</span>
          </span>
          <span className="hidden lg:inline text-neutral-700">|</span>
          <span className="hidden lg:inline">PRECISION PROTOCOL ACTIVE</span>
        </div>
        <div className="flex items-center space-x-6">
           <span className="text-neutral-500 text-[9px]">API OPTIMIZED: 1000 CANDLES / 5MIN</span>
           <div className="w-1 h-1 bg-neutral-800 rounded-full"></div>
           <span className="text-white/20">V4.2.0-RESAMPLING</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
