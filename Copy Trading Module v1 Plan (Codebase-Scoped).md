# Problem statement
Add a new copy-trading module to this existing terminal app, but scope it to what can be delivered safely and simply in the current monolith (React + FastAPI + SQLite), while preserving the product intent in the copy-trading docs.
## Current state (relevant to implementation)
The frontend is a single-page stateful app with tab-driven rendering in `App.jsx (1-199)` and `App.jsx (440-639)`, plus sidebar tab wiring in `components/Sidebar.jsx (1-94)`.
Backend communication is primarily one WebSocket session plus a small REST surface in `scripts/main.py (740-989)`.
Trade persistence and other feature storage are SQLite tables managed in `scripts/detector_engine.py (16-214)`.
There is no user auth subsystem, no routing framework, and no separate indexing service currently.
Product/design intent exists in `app_plan/copy_trading/PRD_polymarket_copy_trading.md (1-247)`, `app_plan/copy_trading/Tech_Design_polymarket_copy_trading.md (1-497)`, and `app_plan/copy_trading/Design_MD_polymarket_copy_trading.md (1-622)`.
## Scope decision (simplicity-first)
Recommended implementation target is a repo-native v1 module, not the full distributed architecture from the technical design doc.
v1 in scope:
* Wallet discovery list based on public trade activity snapshots.
* Follow/unfollow wallets.
* Activity feed for followed wallets.
* Copy config per followed wallet (allocation cap, delay, market filter, daily loss limit, paper-mode toggle).
* Auto-copy execution in PAPER mode first.
v1 out of scope (deferred):
* Dedicated chain indexer service, Redis queueing, KMS session-key signing, multi-service deployment.
* Full live auto-signing copy execution on behalf of user wallets.
## Proposed architecture changes
Backend:
* Introduce a new copy-trading module file (service-style functions) for wallet tracking, config validation, feed ingestion, and copy-execution orchestration.
* Add new SQLite tables for followed wallets, copy configs, tracked source trades, and copied trades; keep schema migration additive and idempotent.
* Add REST endpoints for leaderboard/discovery, follow management, copy config CRUD, and feed retrieval.
* Extend WebSocket message handling with copy-trading events for real-time feed updates and copy execution notifications.
* Add background polling loop for tracked source-wallet activity (interval-based), with dedup keys to prevent repeated copy execution.
Frontend:
* Add a new sidebar section/tab for Copy Trading and subviews (Discover, Following, Feed, My Copies) within existing tab architecture.
* Add copy-setup flow UI (3-step) using existing component style and state patterns.
* Add notifications for copied trades and risk-limit pauses via existing notification mechanism.
* Keep all new UI components isolated under `components/copy_trading/*` to avoid broad churn.
## Data model additions (SQLite)
Add tables:
* `tracked_wallets(session_id, wallet_address, created_at)`
* `copy_configs(id, session_id, source_wallet, enabled, paper_mode, allocation_mode, fixed_amount_usdc, proportional_bps, max_trade_usdc, daily_loss_limit_usdc, market_filter_json, delay_seconds, created_at, updated_at)`
* `tracked_trades(id, source_wallet, market_id, side, price, size_usdc, tx_hash, ts, raw_json)`
* `copied_trades(id, config_id, session_id, source_trade_id, paper_mode, executed_side, executed_price, executed_size_usdc, status, pnl, created_at)`
Add indexes on `(session_id, source_wallet)` and `(source_wallet, ts)` for feed and execution checks.
## Execution plan
Phase 1: backend schema + service skeleton + read endpoints.
Verification: endpoints return empty/default states without breaking existing app behavior.
Phase 2: wallet follow/feed ingestion and deduplicated tracked-trade storage.
Verification: adding a tracked wallet surfaces new feed rows and does not duplicate the same source trade.
Phase 3: copy-config creation and PAPER auto-copy executor with guardrails (cap, delay, market filter, daily loss limit).
Verification: simulated copied trades are recorded and pause correctly when limits are breached.
Phase 4: frontend copy-trading views and setup flow integrated into current tab system.
Verification: user can complete discover -> follow -> configure -> see feed/copied-trade outcomes in UI.
Phase 5: instrumentation and hardening.
Verification: server logs include copy-trading lifecycle events; basic error states render clearly.
## Validation strategy
Backend:
* Unit tests for config validation, size calculation, dedup behavior, and daily loss-limit checks.
* Integration tests for follow/config/feed/copied-trade API flow.
Frontend:
* Component-level tests for setup form validation and status transitions.
* Playwright smoke path for discover -> follow -> activate paper copy -> see copied trade notification.
Manual:
* Confirm no regressions in existing market/scanner/news tabs.
## Risks and mitigations
Risk: source-wallet activity API latency/shape variability.
Mitigation: resilient parsing, retry/backoff, and strict dedup by source-trade identity.
Risk: accidental over-copy from malformed config.
Mitigation: centralized server-side guardrails and hard caps before execution.
Risk: UI complexity creep.
Mitigation: keep v1 to existing visual primitives and avoid router-wide rewrites.
## Assumptions requiring your approval before implementation
* Use current `session_id` model as the user boundary (no new auth system in v1). OK
* Deliver auto-copy in PAPER mode first; live delegated signing is deferred. OK
* Build this as an additive module inside the current monolith rather than introducing external services now. OK
* Access this module from main sidebar, design using Tabsheet for main module pages
