export default function OrderBookView({ book, onPriceClick }) {
  if (!book) return (
    <div style={{ padding: 20, color: "#4b5563", textAlign: "center", fontSize: 12 }}>
      No depth data available for this market.<br/>
      Waiting for 'book' event...
    </div>
  );

  const bids = [...(book.bids || [])].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 15);
  const asks = [...(book.asks || [])].sort((a, b) => parseFloat(a.price) - parseFloat(b.price)).slice(0, 15);

  const maxTotal = Math.max(
    bids.reduce((acc, curr) => acc + parseFloat(curr.size), 0),
    asks.reduce((acc, curr) => acc + parseFloat(curr.size), 0),
    1
  );

  const renderRow = (item, type, cumulative) => {
    const size = parseFloat(item.size);
    const barWidth = (cumulative / maxTotal) * 100;
    return (
      <div 
        key={item.price}
        onClick={() => onPriceClick(parseFloat(item.price))}
        style={{ 
          display: "grid", 
          gridTemplateColumns: "1fr 1fr 1fr", 
          padding: "4px 12px", 
          fontSize: 11, 
          cursor: "pointer", 
          position: "relative",
          borderBottom: "1px solid #0d1117"
        }}
        className="mkt-row"
      >
        <div style={{ 
          position: "absolute", 
          top: 0, 
          bottom: 0, 
          right: 0, 
          width: `${barWidth}%`, 
          background: type === "bid" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
          zIndex: 0,
          pointerEvents: "none"
        }} />
        <span style={{ color: type === "bid" ? "#10b981" : "#ef4444", fontWeight: 600, zIndex: 1 }}>
          {(parseFloat(item.price) * 100).toFixed(1)}¢
        </span>
        <span style={{ textAlign: "right", color: "#94a3b8", zIndex: 1 }}>{size.toLocaleString()}</span>
        <span style={{ textAlign: "right", color: "#4b5563", zIndex: 1 }}>{cumulative.toLocaleString()}</span>
      </div>
    );
  };

  const bidsWithTotal = [];
  let currentBidTotal = 0;
  bids.forEach(b => {
    currentBidTotal += parseFloat(b.size);
    bidsWithTotal.push({ ...b, cumulative: currentBidTotal });
  });

  const asksWithTotal = [];
  let currentAskTotal = 0;
  asks.forEach(a => {
    currentAskTotal += parseFloat(a.size);
    asksWithTotal.push({ ...a, cumulative: currentAskTotal });
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "8px 12px", borderBottom: "1px solid #1f2937", background: "#0d1117", color: "#4b5563", fontSize: 10, fontWeight: 600, letterSpacing: ".05em" }}>
        <span>PRICE</span>
        <span style={{ textAlign: "right" }}>SIZE</span>
        <span style={{ textAlign: "right" }}>TOTAL</span>
      </div>
      
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Asks (Red) */}
        <div style={{ display: "flex", flexDirection: "column-reverse" }}>
          {asksWithTotal.map(a => renderRow(a, "ask", a.cumulative))}
        </div>

        {/* Spread */}
        {bids[0] && asks[0] && (
          <div style={{ padding: "6px 12px", textAlign: "center", background: "#0d1117", color: "#94a3b8", fontSize: 10, borderTop: "1px solid #1f2937", borderBottom: "1px solid #1f2937" }}>
            SPREAD: {((parseFloat(asks[0].price) - parseFloat(bids[0].price)) * 100).toFixed(1)}¢
          </div>
        )}

        {/* Bids (Green) */}
        <div>
          {bidsWithTotal.map(b => renderRow(b, "bid", b.cumulative))}
        </div>
      </div>
    </div>
  );
}
