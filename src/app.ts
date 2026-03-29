import express from 'express';
import { env, pairs, strategyConfig } from './config.js';
import { logger } from './logger.js';
import { appendWorkspaceErrorLog } from './workspaceLog.js';
import { runScan } from './core/runner.js';
import { runPerformanceReview } from './core/reviewRunner.js';
import { isCronAuthorized } from './services/railwayCron.js';
import { formatReviewTelegramMessage, formatScanTelegramMessage, sendTelegramMessage } from './services/telegram.js';
import { getDashboardData, renderDashboardHtml } from './services/dashboard.js';
import { getJournalData, renderJournalHtml } from './services/journal.js';
import { executeTradingViewSignal } from './core/tradingViewExecutor.js';
import { getCurrentMarkPrice } from './services/marketData.js';
import { computeOrderSizeFromEntryUsdt, getContractSpec } from './services/bitgetContracts.js';
import { executeManualLiveOrder } from './core/manualOrder.js';
import { executeManualClose } from './core/manualClose.js';

const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  res.json({ ok: true, strategy: strategyConfig.name, liveTradingEnabled: env.BITGET_ENABLE_LIVE_TRADING, paperTrading: env.BITGET_PAPER_TRADING, pairs, cerebrasEnabled: env.CEREBRAS_ENABLED });
});

app.get('/dashboard', async (_req, res) => {
  try {
    const data = await getDashboardData();
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(renderDashboardHtml(data));
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : 'dashboard_error');
  }
});

app.get('/journal', async (_req, res) => {
  try {
    const data = await getJournalData();
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(renderJournalHtml(data));
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : 'journal_error');
  }
});

app.post('/scan', async (_req, res) => {
  try {
    const result = await runScan();
    const hasSignal = result.results.some((row) => row.signal.decision !== 'none' || row.executionStatus === 'live_order_sent');
    if (hasSignal) {
      await sendTelegramMessage(formatScanTelegramMessage({ realizedDailyLossUsdt: result.realizedDailyLossUsdt, results: result.results }));
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    logger.error(error);
    await appendWorkspaceErrorLog({
      area: 'scan-route',
      summary: 'scan endpoint failed',
      mode: env.BITGET_PAPER_TRADING ? 'paper' : 'live',
      error: error instanceof Error ? error.message : 'unknown_error',
      likelyCause: 'Failure during Bitget fetch, strategy evaluation, risk gate, execution, Supabase logging, or Cerebras advisory',
      nextFix: 'Check prior error entries and inspect market data, credentials, schema, and Cerebras config'
    });
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
});

async function handleCronScan(req: express.Request, res: express.Response) {
  try {
    const token = req.header('x-cron-token') ?? req.query.token?.toString();
    const expected = process.env.CRON_SECRET;
    if (!isCronAuthorized(token, expected)) {
      res.status(401).json({ ok: false, error: 'unauthorized_cron' });
      return;
    }
    const result = await runScan();
    res.json({ ok: true, source: 'cron', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
}

app.get('/cron/scan', handleCronScan);
app.post('/cron/scan', handleCronScan);

app.post('/review', async (_req, res) => {
  try {
    const result = await runPerformanceReview();
    await sendTelegramMessage(formatReviewTelegramMessage({
      totalRuns: result.summary.totalRuns,
      totalSignals: result.summary.totalSignals,
      liveOrdersSent: result.summary.liveOrdersSent,
      blockedCount: result.summary.blockedCount,
      advisory: result.advisory
    }));
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
});

async function handleCronReview(req: express.Request, res: express.Response) {
  try {
    const token = req.header('x-cron-token') ?? req.query.token?.toString();
    const expected = process.env.CRON_SECRET;
    if (!isCronAuthorized(token, expected)) {
      res.status(401).json({ ok: false, error: 'unauthorized_cron' });
      return;
    }
    const result = await runPerformanceReview();
    await sendTelegramMessage(formatReviewTelegramMessage({
      totalRuns: result.summary.totalRuns,
      totalSignals: result.summary.totalSignals,
      liveOrdersSent: result.summary.liveOrdersSent,
      blockedCount: result.summary.blockedCount,
      advisory: result.advisory
    }));
    res.json({ ok: true, source: 'cron', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
}

app.get('/cron/review', handleCronReview);
app.post('/cron/review', handleCronReview);

app.post('/webhook/tradingview', async (req, res) => {
  try {
    const result = await executeTradingViewSignal(req.body);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/manual-order/preview', async (req, res) => {
  try {
    const symbol = String(req.body?.symbol ?? '').trim().toUpperCase();
    const entryUsdt = Number(req.body?.entryUsdt ?? env.BITGET_ENTRY_USDT);
    const leverage = Number(req.body?.leverage ?? env.BITGET_DEFAULT_LEVERAGE);

    if (!symbol) {
      res.status(400).json({ ok: false, error: 'symbol_required' });
      return;
    }

    const currentPrice = await getCurrentMarkPrice(symbol);
    const contract = await getContractSpec(symbol, strategyConfig.productType);
    const sizePlan = computeOrderSizeFromEntryUsdt({
      entryUsdt,
      price: currentPrice,
      leverage,
      contract
    });

    res.json({ ok: true, symbol, currentPrice, entryUsdt, leverage, contract, sizePlan });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/manual-order', async (req, res) => {
  try {
    const symbol = String(req.body?.symbol ?? pairs[0] ?? '').trim().toUpperCase();
    const sideRaw = String(req.body?.side ?? 'buy').trim().toLowerCase();
    const side = sideRaw === 'sell' ? 'sell' : 'buy';
    const entryUsdt = req.body?.entryUsdt !== undefined ? Number(req.body.entryUsdt) : undefined;
    const leverage = req.body?.leverage !== undefined ? Number(req.body.leverage) : undefined;
    const stopLoss = req.body?.stopLoss !== undefined ? Number(req.body.stopLoss) : undefined;
    const takeProfit = req.body?.takeProfit !== undefined ? Number(req.body.takeProfit) : undefined;

    if (!symbol) {
      res.status(400).json({ ok: false, error: 'symbol_required' });
      return;
    }

    const result = await executeManualLiveOrder({
      symbol,
      side,
      entryUsdt,
      leverage,
      stopLoss,
      takeProfit
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/manual-close', async (req, res) => {
  try {
    const symbol = String(req.body?.symbol ?? pairs[0] ?? '').trim().toUpperCase();
    const holdSideRaw = String(req.body?.holdSide ?? '').trim().toLowerCase();
    const holdSide = holdSideRaw === 'short' ? 'short' : holdSideRaw === 'long' ? 'long' : undefined;

    if (!symbol) {
      res.status(400).json({ ok: false, error: 'symbol_required' });
      return;
    }

    const result = await executeManualClose({ symbol, holdSide });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/exit-manager/run', async (_req, res) => {
  try {
    const result = await runScan();
    res.json({ ok: true, exitResults: result.exitResults, positions: result.positions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
});

app.get('/state', async (_req, res) => {
  try {
    const dashboard = await getDashboardData();
    const journal = await getJournalData(20);
    res.json({ ok: true, dashboard: dashboard.meta, totals: dashboard.totals, recent: journal.recent.slice(0, 10) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(500).json({ ok: false, error: message });
  }
});

app.listen(env.PORT, () => {
  logger.info(`bot listening on :${env.PORT}`);
});
