import { memo } from "react";

const SidebarItem = ({ icon, label, isOpen, onClick, active }) => (
  <div 
    className={`sidebar-item ${active ? 'active' : ''}`} 
    onClick={onClick}
    title={!isOpen ? label : ""}
    style={{
      display: "flex",
      alignItems: "center",
      padding: "12px 16px",
      cursor: "pointer",
      gap: 12,
      transition: "all 0.2s",
      color: active ? "var(--accent)" : "#94a3b8",
      background: active ? "rgba(96, 165, 250, 0.1)" : "transparent"
    }}
  >
    <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {icon}
    </div>
    {isOpen && <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>}
  </div>
);

const Sidebar = memo(({ isOpen, onToggle, activeTab, onTabChange }) => {
  const items = [
    { id: 'home', label: 'Terminal', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg> },
    { id: 'news', label: 'News Edge', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2z"></path><polyline points="14 4 14 8 19 8"></polyline><line x1="7" y1="13" x2="17" y2="13"></line><line x1="7" y1="17" x2="17" y2="17"></line><line x1="7" y1="9" x2="10" y2="9"></line></svg> },
    { id: 'scanner', label: 'Alpha Scanner', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg> },
    { id: 'pmbot', label: 'PMBot // AI', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg> },
    { id: 'copy', label: 'Copy Trading', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> },
    { id: 'profile', label: 'Portfolio', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> },
    { id: 'settings', label: 'Settings', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> },
  ];

  return (
    <div className="sidebar" style={{ width: isOpen ? 200 : 60 }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Branding Header */}
        <div style={{ 
          padding: isOpen ? "12px 16px" : "12px 0", 
          display: "flex", 
          flexDirection: "column", 
          alignItems: isOpen ? "flex-start" : "center",
          borderBottom: "1px solid var(--border-color)",
          minHeight: 56,
          justifyContent: "center"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#60a5fa", fontWeight: 700, fontSize: 18 }}>◈</span>
            {isOpen && <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 14, letterSpacing: "-.02em" }}>ALPHATRADER</span>}
          </div>
          {isOpen && <span style={{ color: "#4b5563", fontSize: 9, marginTop: 4, fontWeight: 600, letterSpacing: "0.05em" }}>POLYMARKET</span>}
        </div>

        <div style={{ padding: "16px 16px 8px 16px", display: "flex", justifyContent: isOpen ? "flex-end" : "center" }}>
          <button 
            className="btn-ghost" 
            onClick={onToggle}
            style={{ padding: 4, borderRadius: 4, background: "rgba(31, 41, 55, 0.5)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }}>
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, marginTop: 12 }}>
          {items.map(item => (
            <SidebarItem 
              key={item.id} 
              {...item} 
              isOpen={isOpen} 
              active={activeTab === item.id || (item.id === 'home' && (activeTab === 'markets' || activeTab === 'detail' || activeTab === 'depth' || activeTab === 'history' || activeTab === 'feed'))} 
              onClick={() => {
                if (item.id === 'home') onTabChange('markets');
                else onTabChange(item.id);
              }}
            />
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border-color)", padding: "12px 0" }}>
          <SidebarItem 
            label="Logout" 
            isOpen={isOpen} 
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>} 
          />
        </div>
      </div>
    </div>
  );
});

export default Sidebar;
