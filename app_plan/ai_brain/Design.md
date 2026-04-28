# Design Document: AI Probability Engine ("Edge Brain")
### Polymarket Desktop App — UI/UX Specification
**Status:** Draft v0.1
**Author:** —
**Last Updated:** 2026-04-27

---

## 0. Document Purpose

This document specifies the UX structure, interaction patterns, visual language, and component design for the Edge Brain panel on Polymarket Desktop. It is not a final pixel spec — it is a design system brief and interaction contract for the UI engineering team.

Every major design decision is accompanied by the tradeoff it accepts.

---

## 1. Design Principles (Feature-Specific)

These four principles govern every Edge Brain design decision. When in doubt, rank them in this order:

1. **Calibrated Honesty over Confidence Theater**
   Edge Brain must never feel like a magic oracle. Every output surfaces how certain the model is, not just what it predicts. If we can't be honest about uncertainty, the feature erodes trust faster than it builds it.

2. **Signal Legibility over Feature Richness**
   A trader in mid-decision has 10 seconds to absorb this panel. Three numbers clearly explained beat eight numbers that require decoding. Resist the urge to show everything the model produces.

3. **Supplementary, Not Authoritative**
   The panel lives alongside the market — it does not replace it. The market price is always primary. Edge Brain is always secondary.

4. **Progressive Disclosure**
   The top-level summary is scannable. Signal details are one level deep. Methodology is one more level deep. Nobody is forced past level one.

---

## 2. User Experience Flow

### 2.1 Entry Point

Edge Brain is accessed from the market detail view — it is **not** shown on the market list/browse page.

**Entry trigger options (pick one — needs product alignment):**

| Option | Description | Pro | Con |
|--------|-------------|-----|-----|
| A — Always-visible side panel | Panel docked right of market view, always present | Zero friction, highest visibility | Takes screen real estate, may feel presumptuous |
| B — Tab within market detail | "Edge Brain" tab alongside Order Book, Activity | Familiar tab pattern, contained | Buried, low discovery |
| C — Floating toggle button | Button on market view expands/collapses panel | Doesn't disrupt default experience | Extra click, lower usage |

> ⚠️ **Recommendation:** Option A for power users (who this is built for), with a toggle to collapse/pin. The panel should default open for users who have used it before; default closed (collapsed) for new sessions.

---

## 3. Panel Anatomy

The Edge Brain panel has **four layers** rendered top to bottom:

```
┌─────────────────────────────────────────────┐
│  HEADER                                     │
│  "Edge Brain" · Last updated 4 min ago      │
│  [Confidence badge: MEDIUM]                 │
├─────────────────────────────────────────────┤
│  LEVEL 1: SUMMARY METRICS  (always visible) │
│                                             │
│   Market Price        Model Probability     │
│      68%      →           80%              │
│                                             │
│         EDGE SCORE: +12pp                   │
│         [██████████░░░] Strong Edge         │
│                                             │
├─────────────────────────────────────────────┤
│  LEVEL 2: SIGNAL BREAKDOWN  (expandable)    │
│                                             │
│  📊 Historical Base Rate    71%   [████░]   │
│  📰 News Sentiment          79%   [█████]   │
│  📈 Macro Indicators        70%   [███░░]   │
│                                             │
│  [▼ Show signal details]                    │
├─────────────────────────────────────────────┤
│  LEVEL 3: FOOTER / LEGAL                   │
│  ⚠ Experimental. Not financial advice.      │
│  [About Edge Brain →]                       │
└─────────────────────────────────────────────┘
```

---

## 4. Component Specifications

### 4.1 Header

- **Label:** "Edge Brain" in monospace or tabular numeral typeface — conveys precision without trying to be flashy.
- **Last updated timestamp:** Relative ("4 min ago") not absolute. Updates on data refresh.
- **Confidence badge:** Pill label — `LOW` / `MEDIUM` / `HIGH`. Color-coded:
  - HIGH → Teal/green adjacent (not full green — avoid implying "go here")
  - MEDIUM → Neutral amber
  - LOW → Muted gray (not red — low confidence is not a warning, it's information)

> ⚠️ **Color Concern:** Do NOT use green/red for confidence. Green = buy and red = sell in trading UIs. Confidence is orthogonal to direction. Misusing these colors will cause misreads.

---

### 4.2 Summary Metrics (Level 1)

**Market Price ↔ Model Probability comparison:**

Display as a simple two-column comparison. Arrow or directional indicator between them showing which way the model moves vs. market.

```
  Market      Model
   68%    →   80%
```

The arrow must be:
- Direction-only (→ = model > market; ← = model < market; = = near parity)
- Color-coded by direction, NOT by conviction: rightward = one color, leftward = another
- Consistent (doesn't change color based on which direction is "better")

> ⚠️ **Design Trap:** Avoid making the "model is higher than market" state look visually celebratory and "model is lower" look alarming. Both are valid signals. A market where the model says 30% but price is 60% is equally actionable information — just on the short side.

**Edge Score:**

Displayed as:
- Number: `+12pp` (signed, always show the ±)
- Bar: A horizontal track showing the magnitude, center-anchored at 0
- Tier label: `Strong Edge` / `Mild Edge` / `Efficient`

The bar should be:
- A horizontal gauge from −25pp to +25pp, center at 0
- Neutral track color (not green/red)
- Fill color matches direction indicator from above

> ⚠️ **Tradeoff:** Capping the display at ±25pp means extreme values (e.g., +40pp) show as "maxed out." This is acceptable because extreme scores should be treated with skepticism, not excitement — the visual constraint reinforces that.

---

### 4.3 Signal Breakdown (Level 2)

Collapsed by default; expandable with a single click.

Each signal row:
```
[Icon] Signal Name      [Probability %]   [Mini bar]
```

- **Icons:** Use distinct icons for each signal type (chart/historical, newspaper/news, graph/macro). Not decorative — they serve as visual anchors for fast scanning.
- **Probability %:** The signal's individual probability estimate.
- **Mini bar:** A small progress bar showing the signal's relative weight in the ensemble (heavier = longer bar).

**Expanded state** (on click of signal row):

Shows `metadata` from the signal:
- Historical: "Based on 142 similar markets. Category: US Politics."
- News: "23 articles analyzed. Top sources: Reuters, AP, WSJ. Sentiment: Moderately Positive."
- Macro: "Indicators used: CPI YoY, Fed Funds Rate. Direction: Dovish."

> ⚠️ **Copy Risk:** Metadata must be human-readable, not data-dump. "cpi_yoy = 2.8, fed_funds_rate = 4.25" is meaningless to most users. "CPI has been below 3% for 3 months — historically dovish" is useful. Requires copy QA pass on all metadata strings.

---

### 4.4 Confidence: How to Show It

Confidence is the hardest UX problem in this feature. Too prominent → users overtrust a number that is itself uncertain. Too subtle → users ignore an important qualifier.

**Resolution:**
Confidence is a **modifier on the output**, not a separate equal-weight metric. It should visually "dampen" the Edge Score display when low.

Proposed: When `confidence = LOW`, the Edge Score bar becomes visually lighter/faded and the tier label appears in gray rather than its normal color. The number itself remains, but its visual authority decreases.

> ⚠️ **Open Design Question:** Does a faded score communicate "uncertain" or does it communicate "irrelevant" to users? These are different messages. User testing needed before this pattern ships.

---

### 4.5 States & Edge Cases

| State | UI Behavior |
|-------|-------------|
| Loading (first load) | Skeleton loaders for all metric areas; no fake numbers |
| Refreshing (15-min cycle) | Subtle "refreshing..." label on header; data remains visible |
| Stale data (>30 min) | Amber "Data may be stale" banner below header |
| Market unsupported | Panel shows: "Edge Brain doesn't cover this market type yet." + category list |
| Insufficient data | Panel shows: "Not enough historical data for this market." (thin/new market) |
| Signal unavailable (partial) | Show available signals; note which are missing and why |
| All signals failed | Full error state: "Edge Brain is temporarily unavailable" + retry |

> ⚠️ **Do not hide partial failures.** If news sentiment is unavailable, show historical + macro and label news as "Unavailable." Hiding a missing signal misleads users about what the estimate is based on.

---

### 4.6 Footer & Legal

Always visible, never dismissable:
- `⚠ Experimental — accuracy not guaranteed. Not financial advice.`
- `[About Edge Brain →]` → opens an explainer modal

**About Modal** contains:
- One-paragraph plain-language explanation of how Edge Brain works
- Link to accuracy/calibration page (once live — see PRD FR-08)
- "Why might this be wrong?" section (important for trust)

> ⚠️ **Copy Direction:** The disclaimer should be honest, not defensive. "This model is experimental and may be wrong — here's how to think about it" is better than wall-of-legal-text. Traders respect directness.

---

## 5. Visual Language

### 5.1 Palette (within Polymarket Design System)

Edge Brain should feel like a **technical instrument**, not a marketing module. Reference: Bloomberg terminal panels, quantitative research dashboards.

- **Background:** Slightly differentiated from main market panel (1–2 steps darker or a subtle tint). Creates visual separation without a harsh border.
- **Data colors:** Restricted palette — 2 directional colors (for model > market and model < market) + 1 neutral. All must work in both light and dark Polymarket themes.
- **No traffic light coloring on the edge score itself** (avoid green = good, red = bad framing for a probability signal).

### 5.2 Typography

- Panel label: Monospace or tabular-figure typeface for numbers (prevents layout jitter as numbers change)
- All probability numbers: Tabular numerals, consistent column width
- Labels: System font or Polymarket's existing sans-serif — Edge Brain doesn't need its own font

### 5.3 Motion

- Data refresh: Numbers animate with a subtle count-up on update (not distracting, just noticeable)
- Panel expand/collapse: 200ms ease-out — fast enough not to feel slow, slow enough not to feel jarring
- Loading skeletons: Pulse animation, not spinner

> ⚠️ **Motion Constraint:** Animation should never make the panel feel like a "live ticker" or create anxiety. Prediction markets already have enough emotional charge. Edge Brain should feel calm and deliberate.

---

## 6. Accessibility

- All color distinctions must have a non-color fallback (icon, label, shape)
- Confidence badge must not rely on color alone — include text label
- Panel must be keyboard navigable (tab into, expand signals, open modal)
- Screen reader: All numerical values must have ARIA labels that include units ("68 percent" not "68")
- Directional arrow: Must have aria-label ("Model probability higher than market price" / "lower than market price")

---

## 7. Open Design Questions

| ID | Question | Priority |
|----|----------|----------|
| DQ-01 | Entry point: panel vs. tab vs. toggle? | High — affects feature visibility |
| DQ-02 | Does low confidence "fade" the score? Needs user testing | High |
| DQ-03 | Edge Score display: ±pp delta vs. composite score? (Aligned with PRD OQ-01) | High |
| DQ-04 | Does the panel show on market list, or only market detail? | Medium |
| DQ-05 | What does the panel show on a newly listed market with zero history? | Medium |
| DQ-06 | Should the panel remember collapse state per user? | Low |

---

## 8. What This Design Deliberately Avoids

These choices were considered and rejected:

- **AI-generated text explanation of the probability** — "I believe this market will resolve YES because..." This pattern sounds confident and is often wrong. We show the numbers and let users reason. If we add this, it needs its own PRD entry.
- **Recommendation or call-to-action** ("You should BUY this") — Edge Brain is not an advisor. Adding a CTA crosses the line from signal to recommendation.
- **Animated probability gauge / speedometer** — Visually appealing but communicates false precision. A number like 74% is already specific; turning it into a dial adds theater without information.
- **Social proof layer** ("83 traders used Edge Brain on this market") — Peer influence on probability estimates is a bias amplifier, not a feature.

---

*End of Design doc. See PRD for requirements and Technical Design for implementation architecture.*
