# Polymarket Trader - Project Context

A full-stack application for paper and live trading on Polymarket, featuring a high-fidelity monospace terminal interface.

## Project Overview

- **Purpose**: Real-time price tracking and order execution on Polymarket.
- **Backend**: FastAPI (Python) server that relays Polymarket CLOB data, manages paper trading portfolios, and interfaces with the Polymarket SDK for live trades.
- **Frontend**: React/Vite terminal UI with real-time charts (Lightweight Charts) and WebSocket integration.
- **Data Flow**: 
  - Backend connects to `wss://ws-subscriptions-clob.polymarket.com/ws/market` for live price feeds.
  - Backend provides a WebSocket endpoint (`/ws/{session_id}`) for the frontend to receive price updates and send trade commands.
  - Paper portfolios are persisted locally to `portfolios.json`.

## Core Technologies

### Backend (Python)
- **FastAPI / Uvicorn**: High-performance REST and WebSocket API.
- **websockets / httpx**: Connectivity to Polymarket Gamma API and CLOB.
- **py-clob-client-v2**: Official Polymarket SDK for order placement and position management.
- **py-builder-relayer-client**: Integration for gasless/relayer transactions.

### Frontend (React)
- **Vite**: Build tool and dev server.
- **Lightweight Charts**: High-performance price charting.
- **Tailwind CSS / CSS-in-JS**: Custom "hacker" aesthetic styling.

## Building and Running

### Prerequisites
- Python 3.9+
- Node.js & npm
- `.env` file (see `.env` for required keys like `POLY_PRIVATE_KEY`, `POLY_API_KEY`, etc.)

### Backend
1. **Setup**: `pip install -r requirements.txt`
2. **Run**: `./start.sh` or `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
3. **Health Check**: `http://localhost:8000/health`

### Frontend
1. **Setup**: `npm install`
2. **Run**: `npm run dev`
3. **Access**: `http://localhost:5173`

## Development Conventions

- **Paper Trading**: Default mode. Portfolios are in-memory but synced to `portfolios.json`. Resetting a portfolio clears the local session state.
- **Live Trading**: Requires valid Polymarket API credentials in `.env`. The UI can toggle between PAPER and LIVE modes.
- **WebSocket Protocol**:
  - `init`: Sent on connection, contains initial markets and portfolio state.
  - `price_update`: Real-time price shifts from the CLOB.
  - `heartbeat`: Periodic sync of portfolio values and P&L.
  - `trade`: Client-to-server command to execute orders.
- **Persistence**: `portfolios.json` serves as a lightweight local database. Do not manually edit unless the server is stopped.
- **Styling**: Monospace font (`IBM Plex Mono`) is preferred. UI components use standard CSS objects within JSX for consistent terminal styling.

## Key Files
- `main.py`: Entry point for the FastAPI backend and trading logic.
- `trading-terminal.jsx`: Main React component for the dashboard and chart.
- `portfolios.json`: Local storage for paper trading sessions.
- `.env`: Critical configuration for API endpoints and keys.
