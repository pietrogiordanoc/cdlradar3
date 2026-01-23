import React, { useEffect, useRef } from 'react';

interface TradingViewModalProps {
  symbol: string;
  onClose: () => void;
}

const TradingViewModal: React.FC<TradingViewModalProps> = ({ symbol, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mapeo básico de símbolos para el widget de TradingView
    let tvSymbol = symbol.replace('/', '');
    if (symbol.includes('/')) {
      tvSymbol = `FX:${tvSymbol}`;
    } else if (['SPX', 'IXIC', 'DJI', 'NDX'].includes(symbol)) {
      tvSymbol = `CAPITALCOM:${symbol}`;
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": tvSymbol,
      "interval": "15",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "allow_symbol_change": false,
      "hide_side_toolbar": false, // CAMBIO QUIRÚRGICO: Habilita herramientas de dibujo
      "withdateranges": true,      // CAMBIO QUIRÚRGICO: Habilita rango de fechas inferior
      "save_image": true,          // CAMBIO QUIRÚRGICO: Permite guardar capturas
      "calendar": false,
      "support_host": "https://www.tradingview.com"
    });

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(script);
    }
  }, [symbol]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      {/* CAMBIO QUIRÚRGICO: max-w-[95vw] y h-[92vh] para aumentar el tamaño significativamente */}
      <div className="relative w-full max-w-[95vw] h-[92vh] bg-[#0f0f0f] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <span className="text-xl font-black tracking-tighter text-white">{symbol}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">Live Technical Chart</span>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-neutral-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Ajuste de padding inferior para que el gráfico use todo el espacio */}
        <div className="w-full h-full pb-16">
          <div ref={containerRef} className="tradingview-widget-container" style={{ height: "100%", width: "100%" }}>
            <div className="tradingview-widget-container__widget"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingViewModal;