import { useRef, useEffect } from "react";

/**
 * Professional Candlestick Chart for Polymarket L2
 * Uses Lightweight Charts (v4.1.1)
 */
export default function MarketChart({ data, loading, tokenName, timescale, onTimescaleChange, chartHeight, markers = [] }) {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();

  // 1. Initialize Chart & Series
  useEffect(() => {
    if (!chartContainerRef.current || !window.LightweightCharts) return;

    const chart = window.LightweightCharts.createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: "#060809" },
        textColor: "#94a3b8",
        fontSize: 11,
        fontFamily: "'IBM Plex Mono', monospace",
      },
      grid: {
        vertLines: { color: "rgba(31, 41, 55, 0.3)" },
        horzLines: { color: "rgba(31, 41, 55, 0.3)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      timeScale: {
        borderColor: "#1f2937",
        timeVisible: true,
        barSpacing: 10,
        rightOffset: 5,
      },
      rightPriceScale: {
        borderColor: "#1f2937",
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      crosshair: {
        mode: 0, // Normal
        vertLine: { labelBackgroundColor: "#1e293b" },
        horzLine: { labelBackgroundColor: "#1e293b" },
      }
    });

    const series = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });

    // Add professional watermark
    chart.applyOptions({
      watermark: {
        color: 'rgba(59, 130, 246, 0.06)',
        visible: true,
        text: 'POLYMARKET L2 PRO',
        fontSize: 20,
        horzAlign: 'center',
        vertAlign: 'center',
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only

  // 2. Sync Height
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height: chartHeight });
    }
  }, [chartHeight]);

  // 3. Update Data
  useEffect(() => {
    if (seriesRef.current) {
      // Ensure data is sorted by time and matches OHLC format
      if (data && data.length > 0) {
        seriesRef.current.setData(data);
        // On first load of a new market, fit the content
        if (data.length < 100) chartRef.current?.timeScale().fitContent();
      } else {
        seriesRef.current.setData([]);
      }
    }
  }, [data]);

  // 4. Update Markers (News Spikes)
  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setMarkers(markers);
    }
  }, [markers]);

  return (
    <div style={{ position: "relative", background: "#060809", borderBottom: "1px solid #1f2937" }}>
      {/* Overlay: Controls */}
      <div style={{ position: "absolute", top: 12, left: 16, zIndex: 10, pointerEvents: "none" }}>
        <div style={{ color: "#60a5fa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {tokenName}
        </div>
        <div style={{ display: "flex", gap: "6px", marginTop: "6px", pointerEvents: "auto" }}>
          {["1s", "1m", "15m", "1h", "6h", "1d", "1w"].map(ts => (
            <button 
              key={ts} 
              onClick={() => onTimescaleChange(ts)}
              style={{
                fontSize: 10,
                padding: "2px 8px",
                cursor: "pointer",
                borderRadius: "4px",
                border: "1px solid " + (timescale === ts ? "#3b82f6" : "#1f2937"),
                background: timescale === ts ? "rgba(59, 130, 246, 0.1)" : "#0d1117",
                color: timescale === ts ? "#60a5fa" : "#4b5563",
                fontFamily: "inherit",
                transition: "all 0.2s"
              }}
            >
              {ts.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Overlay: States */}
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(6, 8, 9, 0.6)", zIndex: 20 }}>
          <div style={{ color: "#3b82f6", fontSize: 11, fontWeight: 600, animation: "pulse 2s infinite" }}>SYNCING HISTORY...</div>
        </div>
      )}
      {!loading && (!data || data.length === 0) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
          <span style={{ color: "#374151", fontSize: 11, letterSpacing: "0.05em" }}>NO DATA STREAM AVAILABLE</span>
        </div>
      )}

      {/* The Chart Canvas */}
      <div ref={chartContainerRef} style={{ width: "100%", height: chartHeight }} />
      
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
