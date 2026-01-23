import React, { useEffect, useRef } from 'react';

interface TradingViewModalProps {
  symbol: string;
  onClose: () => void;      // Minimizar (bajar al tray)
  onTerminate: () => void;  // Cerrar y borrar dibujos
}

const TradingViewModal: React.FC<TradingViewModalProps> = ({ symbol, onClose, onTerminate }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Limpieza y preparación
    const pureSymbol = symbol.replace('/', '').toUpperCase();
    let tvSymbol = pureSymbol;

    // 2. DICCIONARIO DE TRADUCCIÓN (Corrección Quirúrgica para Índices)
    const indexMapping: Record<string, string> = {
      'SPX': 'CAPITALCOM:US500',    // S&P 500
      'IXIC': 'CAPITALCOM:US100',   // Nasdaq Composite (usamos el US100 para datos en vivo)
      'NDX': 'CAPITALCOM:US100',    // Nasdaq 100
      'DJI': 'CAPITALCOM:US30',     // Dow Jones
      'DAX': 'CAPITALCOM:DE40',     // DAX Alemán (DE40 es el estándar actual)
      'GER40': 'CAPITALCOM:DE40',
      'UK100': 'CAPITALCOM:UK100',
      'XAUUSD': 'OANDA:XAUUSD',     // Oro
      'XAGUSD': 'OANDA:XAGUSD'      // Plata
    };

    // 3. APLICAR LÓGICA DE PROVEEDOR
    if (indexMapping[pureSymbol]) {
      // Si el símbolo está en nuestro diccionario de "traducción", lo usamos
      tvSymbol = indexMapping[pureSymbol];
    } 
    else if (symbol.includes('/')) {
      // Para pares de Forex normales
      tvSymbol = `FX:${pureSymbol}`;
    }
    else if (typeof instrument !== 'undefined' && instrument?.type === 'crypto') {
      // Para Criptos
      tvSymbol = `BINANCE:${pureSymbol}`;
    }

    // 4. Inyección del Script (el resto del código se mantiene igual)
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    
    const config = {
      "autosize": true,
      "symbol": tvSymbol,
      "interval": "15",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "hide_side_toolbar": false,
      "withdateranges": true,
      "save_image": true,
      "details": true,
      "hotlist": true,
      "calendar": false,
      "support_host": "https://www.tradingview.com",
      "favorites": {
        "intervals": ["5", "15", "60", "240"]
      }
    };

    script.innerHTML = JSON.stringify(config);

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(script);
    }
    
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [symbol]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-black/95 backdrop-blur-xl">
      <div className="relative w-[98vw] h-[96vh] bg-[#0f0f0f] border-2 border-red-500 rounded-[32px] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col">
        
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.01]">
          <div className="flex items-center space-x-4">
            <span className="text-2xl font-black tracking-tighter text-white">{symbol}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">Live Advanced Engine</span>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* BOTÓN MINIMIZAR (Flecha abajo) */}
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl text-neutral-400 hover:text-sky-400 transition-colors"
              title="Minimizar (Mantiene dibujos)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* BOTÓN CERRAR (X) */}
            <button 
              onClick={onTerminate}
              className="p-2 hover:bg-rose-500/20 rounded-xl text-neutral-400 hover:text-rose-500 transition-colors"
              title="Cerrar Gráfico (Borra dibujos)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 w-full relative">
          <div ref={containerRef} className="tradingview-widget-container h-full w-full">
            <div className="tradingview-widget-container__widget h-full w-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingViewModal;