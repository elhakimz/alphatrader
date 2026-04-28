@echo off
title Polymarket Alpha Trader - Launcher
echo ===========================================================
echo   POLYMARKET ALPHA TRADER - FULL SYSTEM STARTUP
echo ===========================================================
echo.

echo [1/3] Launching FastAPI Backend (Port 8888)...
start "Alpha Backend" cmd /k "python -m uvicorn scripts.main:app --host 0.0.0.0 --port 8888 --reload"

echo [2/3] Launching Alpha Scanner Worker...
start "Alpha Worker" cmd /k "python scripts/scanner_worker.py"

echo [3/3] Launching Vite Frontend...
start "Alpha Frontend" cmd /k "npm run dev"

echo.
echo -----------------------------------------------------------
echo   SYSTEM STATUS:
echo   - Backend:  http://localhost:8888
echo   - Frontend: http://localhost:5173
echo.
echo   Closing this window will NOT stop the servers.
echo   Please close the individual windows to stop each process.
echo -----------------------------------------------------------
echo.
pause
