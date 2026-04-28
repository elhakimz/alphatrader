```markdown
# Desktop UI Design — Polymarket: Real-Time Data + News Edge Module

**Version:** 1.0 (Desktop Edition)  
**Status:** Draft  
**Owner:** Design  
**Last Updated:** April 27, 2026  

---

## 1. Desktop Design Principles & Layout

### 1.1 Core Philosophy for Desktop
While the core principles of **Signal over noise**, **Speed first**, and **Credibility visible** remain, the desktop environment offers a broader canvas. The desktop design leverages a multi-column architecture to allow users to monitor the global feed and interact with specific market charts simultaneously without losing context.

### 1.2 Grid & Breakpoints
The desktop application adheres to a flexible grid system tailored for high information density:
- **Tablet / Small Web (640–1024px):** Two-column layout (Feed + Side Panel for expanded cards).
- **Desktop Web (> 1024px):** Three-column layout: Global Nav (Left) / Main News Feed (Center) / Market Sidebar (Right).
- **Ultrawide (> 1440px):** Max content width of 1400px, centered on the screen to prevent excessive eye travel.

### 1.3 Desktop-Specific Design Tokens
- **Density:** Web cards are maximally compressed to a max height of **80px** to allow scanning of more items per viewport.
- **Interactions:** Heavy utilization of `bg-surface-hover` (#1E2128) for cursor feedback. 
- **Keyboard Navigation:** Full tab-order support on all interactive elements. `Escape` key closes active modals, expanded states, or inline overlays.

---

## 2. Desktop Screen Inventory

| Screen ID | Screen Name | Layout / Paradigm |
|---|---|---|
| **DS-01** | Global News Feed | Main center column (Three-column layout) |
| **DS-02** | Category Filter Bar | Sticky header below main top-nav |
| **DS-03** | News Item Card | 80px collapsed, expands **inline** on click |
| **DS-04** | Market Detail Sidebar | 320px persistent right panel (collapsible to 48px) |
| **DS-08** | Cooldown Overlay | Top-of-screen banner on market detail view |
| **DS-09** | Settings Modal | Centered dialog / modal overlay |
| **DS-10** | News Item Detail | Full-page takeover or wide-center column |

---

## 3. Desktop Screen Specifications

### DS-01 & DS-04 — The Three-Column Workspace

**Purpose:** The primary desktop workspace where users monitor the global pulse while keeping a close eye on a selected market.

**Layout Wireframe (>1024px):**

```text
┌────────────────┬──────────────────────────────────────┬───────────────────────────┐
│ Global Nav     │ DS-01: Global News Feed              │ DS-04: Market Sidebar     │
│ (Left)         │ (Center Column - 600px to 800px)     │ (Right Column - 320px)    │
│                │                                      │                           │
│ [Logo]         │  [All ✓] [Elections] [Crypto]        │  ╔══════════════════════╗ │
│                │  ─── Live · 847 items today ──────   │  ║  News · Last 24h   ▼ ║ │
│ 🏠 Home        │                                      │  ╚══════════════════════╝ │
│ 📈 Markets     │  ┌─ News Card (80px height) ───────┐ │                           │
│ 📰 News Edge   │  │ 🔴 81 BREAKING EDGE             │ │  Will Trump win the 2026  │
│ ⚙️ Settings    │  │ Fed cuts rates 75bps — largest  │ │  Senate majority?         │
│                │  │ ● Reuters T1 · ▲ Bullish · 2m   │ │                           │
│                │  └─────────────────────────────────┘ │  YES: 63¢  NO: 37¢        │
│                │                                      │  ████████████░░░░░░░      │
│                │  ┌─ News Card (Expanded Inline) ───┐ │                           │
│                │  │ 🟠 67 HIGH SIGNAL               │ │  [Buy YES] [Buy NO]       │
│                │  │ ─────────────────────────────── │ │                           │
│                │  │ Trump leads Georgia by 4pts     │ │  ─ Price History ──────── │
│                │  │                                 │ │  ╭─────────────────╮      │
│                │  │ ┌─ AI Summary ───────────────┐  │ │  │   chart         │      │
│                │  │ │ Polling averages shift...  │  │ │  ╰─────────────────╯      │
│                │  │ └────────────────────────────┘  │ │  ← [caused this spike]    │
│                │  │ [Read full ↗]                   │ │     at 14:23 — +11¢       │
│                │  │                                 │ │                           │
│                │  │ ── Related Markets ───────────  │ │  ┌────────────────────┐   │
│                │  │ [Market 1] [Market 2]           │ │  │ 🔴 81 BREAKING     │   │
│                │  └─────────────────────────────────┘ │  │ Trump leads GA +4  │   │
│                │                                      │  │ ● AP · T1 · 7m ago │   │
│                │  ┌─ News Card (80px height) ───────┐ │  │ ▲ Bullish (0.91)   │   │
│                │  │ 🟡 44 MODERATE                  │ │  └────────────────────┘   │
│                │  │ BTC ETF inflows slow in Q1      │ │                           │
│                │  │ ● CoinDesk T2 · ▼ Bearish · 14m │ │  [Show 7-day history]     │
│                │  └─────────────────────────────────┘ │                           │
└────────────────┴──────────────────────────────────────┴───────────────────────────┘
```

**Interaction Details:**
- **Auto-refresh:** New items slide down smoothly (200ms ease-out) at the top of the feed.
- **Hover States:** Hovering over a collapsed card shifts background to `bg-surface-hover`. Cursor changes to pointer.
- **Inline Expansion (DS-03):** Unlike mobile where a bottom sheet appears, clicking a web card expands it *inline*, pushing the items below it downwards.

### DS-04 — Market Detail Sidebar (Deep Dive)

**Purpose:** A dedicated 320px persistent panel on the right side of any individual Market Detail page.

**Interactive "Spike" Annotation:**
- Desktop users have precision mouse control. When hovering over a high-velocity price spike on the main chart, a dashed leader line connects the spike directly to the causative high-PIS news item in the right sidebar.
- Clicking the annotation scrolls the sidebar (if needed) and temporarily flashes the `bg-surface-hover` color on the related news card to draw attention.
- **Collapsibility:** To save screen real estate for complex charting, the sidebar can be collapsed to a 48px icon rail (showing only PIS color dots/icons).

### DS-08 — Overreaction Cooldown Overlay (Web)

**Display:** A persistent banner that appears below the main navigation bar but above the market content when a market experiences excessive velocity.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚡ Market Velocity Alert: This market moved 11% in 9 minutes (3.2× baseline)│
│    Historical reversion within 2h: 67%  [██████████░░░░]                    │
│    Triggered by: "Fed cuts 75bps" (PIS 81)   [View News]  [Dismiss ✕]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### DS-10 — News Item Detail Page (Desktop)

**Layout:** Replaces the center feed column or opens in a wide modal overlay (max-width: 800px) to maintain background context.

- **Split View:** Left side (60%) contains the AI Summary, Article text/link, and source details. Right side (40%) contains the **PIS Score Breakdown** and **Related Markets**.
- **Data Visualization:** The PIS component horizontal bars feature tooltip hover states revealing the exact mathematical weighting of each factor (e.g., Source Credibility = 0.35 weight).

---

## 4. Desktop-Specific Components & Accessibility

### 4.1 Hover & Focus States
- Keyboard focus outlines use the `--focus` token (`#A78BFA` purple) with a 2px offset.
- "Trade ›" buttons on related market cards reveal on hover to reduce visual clutter when scanning.

### 4.2 Tooltips
With mouse support, tooltips are heavily utilized to preserve clean UI:
- Hovering over a Source Tier (e.g., `T1`) displays: *"Tier 1: Top-tier verified journalistic institution or primary source."*
- Hovering over the Sentiment Indicator (e.g., `▲ 0.87`) displays: *"87% algorithmic confidence that this news drives a YES position."*

### 4.3 Motion on Web
- Respect `prefers-reduced-motion` media queries. 
- Avoid heavy layout shifts; when expanding a card inline, use a smooth height interpolation.
```