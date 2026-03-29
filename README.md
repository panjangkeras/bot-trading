# Bitget Trading Bot

Bot futures Bitget dengan Railway + Supabase + Telegram + Cerebras advisory.

## Fitur
- Multi-pair scan
- Live/paper mode
- Deterministic strategy: `trend-pullback-intraday-v2`
- Daily loss gate
- Max position gate
- Cooldown dasar
- Auto set leverage
- Auto market entry
- Trade management: TP1, TP2, break even, trailing stop
- Supabase logging (`bot_runs`, `bot_reviews`)
- Telegram notifications
- Cerebras advisory + performance review loop
- Dashboard web ringan
- Trading journal web
- TradingView webhook executor
- Cron endpoints untuk Railway

## Endpoint
- `GET /health`
- `GET /dashboard`
- `GET /journal`
- `POST /scan`
- `POST /cron/scan`
- `POST /review`
- `POST /cron/review`
- `POST /webhook/tradingview`
- `GET /state`
- `POST /manual-order/preview`
- `POST /manual-order`
- `POST /manual-close`
- `POST /exit-manager/run`

## Railway
1. Deploy repo ke Railway
2. Isi env vars sesuai `.env.example`
3. Set `CRON_SECRET`
4. Scheduler scan -> `GET` atau `POST /cron/scan?token=CRON_SECRET`
5. Scheduler review -> `GET` atau `POST /cron/review?token=CRON_SECRET`
6. Jalankan `supabase/schema.sql`

## Catatan
- trade decision utama tetap rule-based
- Cerebras hanya advisory
- untuk produksi, mulai dari size kecil dan monitor trade pertama
