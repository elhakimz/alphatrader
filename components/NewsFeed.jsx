/**
 * NewsFeed Component
 * Displays a list of enriched news items with PIS scores and market links.
 */
export default function NewsFeed({ news, onMarketClick, title }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Module Header */}
      <div style={{ 
        padding: "12px 16px", 
        borderBottom: "1px solid #1f2937", 
        background: "#0d1117",
        display: "flex",
        alignItems: "center",
        gap: 12
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", boxShadow: "0 0 8px #3b82f6" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#f8fafc", letterSpacing: "0.05em" }}>
          {title ? `RESEARCH: ${title.toUpperCase()}` : "GLOBAL INTELLIGENCE FEED"}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {(!news || news.length === 0) ? (
          <div className="empty-state">
            <div style={{ marginBottom: 10, opacity: 0.5 }}>
              {title ? "NO SPECIFIC SIGNALS FOUND" : "NO ACTIVE SIGNALS"}
            </div>
            <div style={{ fontSize: 10 }}>
              {title ? `Groq is currently performing targeted research on this topic...` : "News Engine is currently polling global RSS sources..."}
            </div>
          </div>
        ) : (
          news.map((item) => (
            <NewsItem key={item.id} item={item} onMarketClick={onMarketClick} />
          ))
        )}
      </div>
    </div>
  );
}


function NewsItem({ item, onMarketClick }) {
  const pisColor = item.pis >= 75 ? "#ef4444" : item.pis >= 50 ? "#f59e0b" : "#3b82f6";
  const sentimentColor = item.sentiment === "BULLISH" ? "#10b981" : item.sentiment === "BEARISH" ? "#ef4444" : "#94a3b8";

  return (
    <div 
      className="mkt-row"
      style={{ 
        padding: "12px", 
        border: "1px solid #1f2937", 
        borderRadius: "4px", 
        marginBottom: "12px",
        background: "#0d1117",
        position: "relative"
      }}
    >
      {/* PIS Badge */}
      <div style={{ 
        position: "absolute", 
        top: 12, 
        right: 12, 
        padding: "2px 6px", 
        background: `${pisColor}22`, 
        color: pisColor, 
        borderRadius: "4px", 
        fontSize: 10, 
        fontWeight: "bold",
        border: `1px solid ${pisColor}44`
      }}>
        PIS: {item.pis}
      </div>

      <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 4, display: "flex", gap: 8 }}>
        <span>{item.source.toUpperCase()}</span>
        <span>•</span>
        <span>{new Date(item.ts).toLocaleTimeString()}</span>
      </div>

      <div style={{ fontSize: 13, color: "#f8fafc", fontWeight: 600, marginBottom: 8, lineHeight: 1.4, paddingRight: 60 }}>
        {item.headline}
      </div>

      {item.summary && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12, lineHeight: 1.5 }}>
          {item.summary}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: `${sentimentColor}22`, color: sentimentColor, fontWeight: "bold" }}>
            {item.sentiment}
          </span>
          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: "#3b82f6", textDecoration: "none", alignSelf: "center" }}>
            SOURCE ↗
          </a>
        </div>

        {item.market_id && (
          <button 
            className="btn-ghost"
            style={{ fontSize: 10, padding: "4px 8px", color: "#60a5fa" }}
            onClick={() => onMarketClick(item.market_id)}
          >
            VIEW MARKET ›
          </button>
        )}
      </div>
    </div>
  );
}
