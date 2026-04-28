import { memo, useEffect, useRef } from "react";
import { fmtTs } from "../utils";

const LogViewer = memo(({ logs }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (level) => {
    switch (level?.toUpperCase()) {
      case "ERROR": return "#ef4444";
      case "WARN":  return "#f59e0b";
      case "INFO":  return "#10b981";
      case "DEBUG": return "#60a5fa";
      case "WS":    return "#8b5cf6";
      default:      return "#94a3b8";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0a0c0f", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1f2937", background: "#0d1117", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#f8fafc", letterSpacing: "0.05em" }}>SYSTEM LOGS</h3>
        <span style={{ fontSize: 10, color: "#4b5563" }}>{logs.length} ENTRIES</span>
      </div>

      <div 
        ref={scrollRef}
        style={{ 
          flex: 1, 
          overflowY: "auto", 
          padding: "12px 16px", 
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "11px",
          lineHeight: "1.6"
        }}
      >
        {logs.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>Waiting for system events...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ marginBottom: "4px", display: "flex", gap: "8px" }}>
              <span style={{ color: "#4b5563", whiteSpace: "nowrap" }}>[{fmtTs(log.ts)}]</span>
              <span style={{ color: getLevelColor(log.level), fontWeight: "bold", minWidth: "50px" }}>
                {log.level || "INFO"}
              </span>
              <span style={{ color: "#cbd5e1", wordBreak: "break-all" }}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export default LogViewer;
