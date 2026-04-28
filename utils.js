export function fmt$(n) { 
  return "$" + (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); 
}

export function fmtPct(n) { 
  return (n * 100).toFixed(1) + "¢"; 
}

export function fmtTs(iso) { 
  if (!iso) return ""; 
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); 
}

export function clamp(v, lo, hi) { 
  return Math.max(lo, Math.min(hi, v)); 
}
