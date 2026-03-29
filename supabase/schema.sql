create table if not exists public.bot_runs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  symbol text not null,
  timeframe_trend text not null,
  timeframe_entry text not null,
  decision text not null check (decision in ('long', 'short', 'none')),
  confidence numeric not null default 0,
  reason jsonb not null default '[]'::jsonb,
  entry_price numeric null,
  stop_loss numeric null,
  take_profit numeric null,
  mode text not null check (mode in ('paper', 'live')),
  pnl_usdt numeric null,
  execution_status text null,
  order_payload jsonb null
);

create index if not exists bot_runs_created_at_idx on public.bot_runs (created_at desc);
create index if not exists bot_runs_symbol_idx on public.bot_runs (symbol);

create table if not exists public.bot_reviews (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  summary jsonb not null,
  advisory text null
);
