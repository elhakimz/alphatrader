# AlphaTrader: High-Fidelity Discovery & Intelligence Terminal

AlphaTrader is a sophisticated, monospace-styled terminal for real-time market discovery and execution. Built for traders who prioritize speed and information edge, it integrates with **Polymarket** to provide real-time price feeds, automated arbitrage scanning, and AI-driven autonomous trading.

## 🚀 Core Modules

### 1. PMBot (Autonomous Trading Engine)
PMBot is a 24/7 autonomous agent designed for disciplined capital allocation.
*   **3-Agent Consensus**: Uses 2-of-3 Groq (Llama 3.3-70b) agent consensus for every trade entry.
*   **Whale Tracking**: Monitors 47 curated "smart money" wallets on-chain (Polygon) and uses their activity as a primary signal trigger.
*   **Risk Management**: Built-in Kelly Criterion sizing, drawdown circuit breakers, and correlation limits.
*   **Self-Healing TTR**: Automatically calculates Time-to-Resolution to filter out stale or expired markets.
*   **Persistence**: Full audit trail in `pmbot.db` including agent reasoning, votes, and execution logs.

### 2. AI Brain (Intelligence & Predictions)
The "Brain" of AlphaTrader transforms raw order book data and news into probabilistic edges.
*   **Fair Probability Estimates**: Real-time AI valuation of binary outcomes vs. market prices.
*   **News Spike Correlation**: Visual indicators directly on the chart linking enriched news events to specific price actions.
*   **Sentiment Analysis**: Background processing of global news signals to determine directional bias.

### 3. CopyTrading Module
A professional-grade mirror trading system for following high-conviction wallets.
*   **Wallet Profiles**: Detailed win-rate and trade history analysis for any Polymarket address.
*   **Automated Execution**: Mirrors whale entries with custom slippage controls and fixed/proportional sizing.
*   **Safety Guards**: Maximum exposure limits per whale to prevent following "wash traders."

### 4. Alpha Scanner & News Edge
*   **Alpha Scanner**: Background discovery engine surfacing arbitrage opportunities and price inefficiencies.
*   **News Edge**: Deep-dive research tool that filters and summarizes global signals specifically for selected markets.

### 5. Trading Terminal (Execution)
![AlphaTrader Terminal](screenshots/terminal_chart.png)
The main workspace for manual analysis and trade management.
*   **Professional Charting**: High-performance candlestick charts powered by Lightweight Charts.
*   **Real-Time L2 Depth**: Full order book relay directly from the Polymarket CLOB.
*   **Dual Mode**: Seamlessly toggle between **PAPER** (simulated) and **LIVE** (mainnet) trading.

## 🛠 Tech Stack

*   **Frontend**: React, Vite, Lightweight Charts, Tailwind CSS.
*   **Backend**: FastAPI (Python 3.11+), Uvicorn, Websockets.
*   **Intelligence**: Groq SDK (Llama 3.3-70b-versatile).
*   **On-Chain**: Web3.py for Polygon wallet monitoring.
*   **Persistence**: SQLite (WAL mode) for audits and JSON for portfolios.

## 🏁 Quick Start

### 1. Requirements
*   Python 3.11+
*   Node.js & npm
*   A Groq API Key (for discovery/research features)

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
POLY_API_KEY=your_polymarket_key
POLY_SECRET=your_polymarket_secret
POLY_PASSPHRASE=your_passphrase
POLY_PRIVATE_KEY=your_private_key
GROQ_API_KEY=your_groq_api_key
POLYGON_RPC_URL=your_rpc_node
```

### 3. Launch the System
On Windows: `run_app.bat` | On Linux: `./start.sh`

---
*Built for the edge. Optimized for the terminal.*
