import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ALL_INSTRUMENTS, REFRESH_INTERVAL_MS } from './constants.tsx';
import { STRATEGIES } from './utils/tradingLogic';
import { MultiTimeframeAnalysis, ActionType } from './types';
import InstrumentRow from './components/InstrumentRow';
import TimerDonut from './components/TimerDonut';
import TradingViewModal from './components/TradingViewModal';

type SortConfig = { key: 'symbol' | 'action' | 'signal' | 'price' | 'score'; direction: 'asc' | 'desc' } | null;
type ActionFilter = 'all' | 'entrar' | 'salir' | 'esperar';

const App: React.FC = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [filter, setFilter] = useState<'all' | 'forex' | 'indices' | 'stocks' | 'commodities' | 'crypto'>('all');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
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

  useEffect(() => {
    if (isTestActive) {
      const timer = setTimeout(() => {
        setIsTestActive(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isTestActive]);

  const handleRefreshComplete = useCallback(() => {
    setRefreshTrigger(t => t + 1);
  }, []);

  const handleAnalysisUpdate = useCallback((id: string, data: MultiTimeframeAnalysis | null) => {
    if (!data) return;
    analysesRef.current[id] = data;
    forceUpdate(t => t + 1);
  }, []);

  const requestSort = (key: 'symbol' | 'action' | 'signal' | 'price' | 'score') => {
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

    // Filtro por acción
    if (actionFilter !== 'all') {
      items = items.filter(i => {
        const analysis = currentAnalyses[i.id];
        if (actionFilter === 'entrar') return analysis?.action === ActionType.ENTRAR_AHORA;
        if (actionFilter === 'salir') return analysis?.action === ActionType.SALIR;
        if (actionFilter === 'esperar') return analysis?.action === ActionType.ESPERAR || analysis?.action === ActionType.NADA;
        return true;
      });
    }

    return [...items].sort((a, b) => {
      const analysisA = currentAnalyses[a.id];
      const analysisB = currentAnalyses[b.id];

      if (sortConfig) {
        const { key, direction } = sortConfig;
        let valA: any, valB: any;
        
        if (key === 'action') {
          // Lógica cíclica solicitada: Standby -> Entrar -> Salir
          const actionOrder = {
            [ActionType.ESPERAR]: 1,
            [ActionType.NADA]: 1,
            [ActionType.ENTRAR_AHORA]: 2,
            [ActionType.SALIR]: 3,
            [ActionType.MERCADO_CERRADO]: 4,
            [ActionType.NOTICIA]: 5
          };
          valA = actionOrder[analysisA?.action || ActionType.NADA];
          valB = actionOrder[analysisB?.action || ActionType.NADA];
        } else if (key === 'symbol') { valA = a.symbol; valB = b.symbol; }
        else if (key === 'price') { valA = analysisA?.price || 0; valB = analysisB?.price || 0; }
        else if (key === 'score') { valA = analysisA?.powerScore || 0; valB = analysisB?.powerScore || 0; }
        else if (key === 'signal') { valA = analysisA?.mainSignal || ''; valB = analysisB?.mainSignal || ''; }
        
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
      }

      // Default sort by score and entries
      const isEntryA = analysisA?.action === ActionType.ENTRAR_AHORA;
      const isEntryB = analysisB?.action === ActionType.ENTRAR_AHORA;
      if (isEntryA && !isEntryB) return -1;
      if (!isEntryA && isEntryB) return 1;
      
      return (analysisB?.powerScore || 0) - (analysisA?.powerScore || 0);
    });
  }, [filter, actionFilter, searchQuery, sortConfig, refreshTrigger]);

  return (
    <div className="min-h-screen pb-24 bg-[#050505] text-white selection:bg-emerald-500/30">
      <header className="sticky top-0 z-50 bg-[#050505]/95 backdrop-blur-2xl border-b border-white/5 px-8 py-5">
        <div className="max-w-[1360px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="bg-emerald-500/20 p-2.5 rounded-2xl border border-emerald-500/20">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white uppercase">CDLRadar V4.2</h1>
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Live Market Scanner</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(['all', 'forex', 'indices', 'stocks', 'commodities', 'crypto'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-300 border
                    ${filter === f 
                      ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                      : 'bg-white/5 border-white/5 text-neutral-500 hover:text-white hover:bg-white/10'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3 bg-white/5 p-2 rounded-xl border border-white/10">
              <button 
                onClick={() => setIsTestActive(!isTestActive)}
                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${isTestActive ? 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 'bg-neutral-800 text-neutral-500 hover:text-white'}`}
              >
                Test Mode
              </button>
              <div className="h-4 w-px bg-white/10"></div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <input 
                  type="range" min="0" max="1" step="0.1" 
                  value={volume} 
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500/50 w-40 transition-all"
              />
            </div>
            <TimerDonut 
              durationMs={REFRESH_INTERVAL_MS} 
              onComplete={handleRefreshComplete} 
              isPaused={false} 
            />
          </div>
        </div>
      </header>

      <main className="max-w-[1360px] mx-auto px-8 mt-10">
        <div className="grid grid-cols-1 gap-4">
          {isTestActive && (
            <div className="mb-6 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-2 px-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                Demo Simulation (3s)
              </div>
              <InstrumentRow
                instrument={{ id: 'DEMO', symbol: 'DEMO/USD', name: 'Simulation Row', type: 'forex' }}
                isConnected={true}
                onToggleConnect={() => {}}
                globalRefreshTrigger={refreshTrigger}
                strategy={STRATEGIES[0]}
                isTestMode={true}
              />
              <div className="h-px bg-white/5 my-4"></div>
            </div>
          )}

          <div className="flex items-center justify-between px-6 py-3 bg-white/[0.02] rounded-xl border border-white/5 mb-4 text-[10px] font-black uppercase tracking-widest text-neutral-600">
            <div className="w-24 text-center">Market</div>
            <div className="w-1/4 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('symbol')}>Instrument</div>
            <div className="w-1/3 text-center">MTF Alignment (4H - 1H - 15M - 5M)</div>
            <div className="w-1/6 text-center cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('score')}>Score</div>
            <div className="min-w-[150px] flex flex-col items-center">
              <span className="cursor-pointer hover:text-white transition-colors mb-2" onClick={() => requestSort('action')}>Action</span>
              <div className="flex items-center justify-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/5 scale-90">
                <button 
                  onClick={() => setActionFilter('all')}
                  className={`px-2 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest transition-all ${actionFilter === 'all' ? 'bg-white/10 text-white' : 'text-neutral-500'}`}
                >All</button>
                <button 
                  onClick={() => setActionFilter('entrar')}
                  className={`px-2 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest transition-all ${actionFilter === 'entrar' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-neutral-500'}`}
                >Entrar</button>
                <button 
                  onClick={() => setActionFilter('salir')}
                  className={`px-2 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest transition-all ${actionFilter === 'salir' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-neutral-500'}`}
                >Salir</button>
                <button 
                  onClick={() => setActionFilter('esperar')}
                  className={`px-2 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest transition-all ${actionFilter === 'esperar' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-neutral-500'}`}
                >Standby</button>
              </div>
            </div>
            <div className="w-10"></div>
          </div>
          
          {filteredInstruments.map(instrument => (
            <InstrumentRow
              key={instrument.id}
              instrument={instrument}
              isConnected={true}
              onToggleConnect={() => {}}
              globalRefreshTrigger={refreshTrigger}
              strategy={STRATEGIES[0]}
              onAnalysisUpdate={handleAnalysisUpdate}
              isTestMode={false}
              onOpenChart={setSelectedChartSymbol}
            />
          ))}
          {filteredInstruments.length === 0 && (
            <div className="py-20 text-center text-neutral-600 font-bold uppercase tracking-widest border border-dashed border-white/5 rounded-3xl">
              No instruments found with current filters
            </div>
          )}
        </div>
      </main>

      {selectedChartSymbol && (
        <TradingViewModal 
          symbol={selectedChartSymbol} 
          onClose={() => setSelectedChartSymbol(null)} 
        />
      )}
    </div>
  );
};

export default App;