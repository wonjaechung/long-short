import { NextRequest, NextResponse } from 'next/server';
import ccxt from 'ccxt';
import axios from 'axios'; // <-- Import axios for direct calls

// Define a type for our data structure for better type safety
type LongShortRatioData = {
  exchange: string;
  status: 'Success' | 'Not Supported' | 'Error';
  longShortRatio?: number;
  longPercent?: number;
  shortPercent?: number;
  message?: string;
};

// Helper function to parse the raw 'info' object from CCXT
// This is where we'll need to add logic for each exchange
function parseExchangeData(exchangeId: string, ratioData: any): { longPercent: number | null, shortPercent: number | null } {
    let longPercent = null;
    let shortPercent = null;

    // Logic for binanceusdm
    if (exchangeId === 'binanceusdm' && ratioData.info.longAccount && ratioData.info.shortAccount) {
        longPercent = parseFloat(ratioData.info.longAccount) * 100;
        shortPercent = parseFloat(ratioData.info.shortAccount) * 100;
    }

    // Logic for bitget
    else if (exchangeId === 'bitget' && ratioData.info.longAccountRatio && ratioData.info.shortAccountRatio) {
        longPercent = parseFloat(ratioData.info.longAccountRatio) * 100;
        shortPercent = parseFloat(ratioData.info.shortAccountRatio) * 100;
    }

    // Logic for okx
    else if (exchangeId === 'okx' && ratioData.info.longShortRatio) {
        const ratio = parseFloat(ratioData.info.longShortRatio);
        // Derive percentages from the ratio: Short = 1 / (Ratio + 1), Long = 1 - Short
        const short = 1 / (ratio + 1);
        const long = 1 - short;
        longPercent = long * 100;
        shortPercent = short * 100;
    }

    // Logic for bybit
    else if (exchangeId === 'bybit' && ratioData.info.buyRatio && ratioData.info.sellRatio) {
        longPercent = parseFloat(ratioData.info.buyRatio) * 100;
        shortPercent = parseFloat(ratioData.info.sellRatio) * 100;
    }
    
    return { longPercent, shortPercent };
}

// Final, corrected timeframe map based on our testing
const timeframeMap = {
    binanceusdm: { '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d' },
    bybit:       { '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1d' },
    okx:         { '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H' /* 1d not supported */ },
    bitget:      { '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h' /* 1d not supported */ },
    gateio:      { '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d' },
};

// Helper for krakenfutures since it has a different timeframe format (seconds)
const krakenTimeframeMap = {
    '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedSymbol = searchParams.get('symbol') || 'BTC'; // Default to BTC
  const uiTimeframe = searchParams.get('timeframe') || '5m';

  const exchanges = [
    'binanceusdm',
    'bybit',
    'okx',
    'bitget',
    'huobi',
    'gateio' // <-- Add Gate.io back
  ];

  const promises = exchanges.map(async (exchangeId): Promise<LongShortRatioData> => {
    // --- Special handling for Huobi using a direct API call ---
    if (exchangeId === 'huobi') {
        try {
            const contractCode = `${requestedSymbol}-USDT`;
            const huobiTimeframe = uiTimeframe.replace('m', 'min').replace('h', 'hour'); // e.g., '5min', '60min'
            const response = await axios.get(`https://api.hbdm.com/linear-swap-api/v1/swap_elite_account_ratio?contract_code=${contractCode}&period=${huobiTimeframe}`);
            
            const latestData = response.data?.data?.list?.[0];
            if (!latestData || latestData.buy_ratio === undefined || latestData.sell_ratio === undefined) {
                return { exchange: exchangeId, status: 'Error', message: 'Invalid data from Huobi API.' };
            }

            const buyRatio = parseFloat(latestData.buy_ratio);
            const sellRatio = parseFloat(latestData.sell_ratio);
            const totalRatio = buyRatio + sellRatio;

            // Normalize the ratios to sum to 100%
            const longPercent = totalRatio > 0 ? (buyRatio / totalRatio) * 100 : 0;
            const shortPercent = totalRatio > 0 ? (sellRatio / totalRatio) * 100 : 0;

            return {
                exchange: exchangeId,
                status: 'Success',
                longShortRatio: sellRatio > 0 ? buyRatio / sellRatio : 0,
                longPercent: longPercent,
                shortPercent: shortPercent,
            };
        } catch (e: any) {
            return { exchange: exchangeId, status: 'Error', message: e.message };
        }
    }

    // --- Special handling for Kraken Futures ---
    if (exchangeId === 'krakenfutures') {
        try {
            const symbol = requestedSymbol.toLowerCase() + 'usd'; // e.g., 'btcusd'
            const interval = krakenTimeframeMap[uiTimeframe];
            if (!interval) {
                return { exchange: exchangeId, status: 'Error', message: `Timeframe '${uiTimeframe}' not supported.` };
            }
            // We need a 'since' timestamp from the recent past to get the latest data point
            const since = Math.floor(Date.now() / 1000) - (interval * 2); // Go back 2 intervals

            const response = await axios.get(`https://futures.kraken.com/api/charts/v1/analytics/${symbol}/long-short-info?since=${since}&interval=${interval}`);

            const latestData = response.data?.result?.data?.top20Percent;
            if (!latestData || latestData.longPercent.length === 0) {
                 return { exchange: exchangeId, status: 'Error', message: 'No data returned from Kraken API.' };
            }
            
            // Get the last element from the arrays
            const longPercent = parseFloat(latestData.longPercent.slice(-1)[0]) * 100;
            const shortPercent = parseFloat(latestData.shortPercent.slice(-1)[0]) * 100;
            const ratio = parseFloat(latestData.ratio.slice(-1)[0]);
            
            return {
                exchange: exchangeId,
                status: 'Success',
                longShortRatio: ratio,
                longPercent: longPercent,
                shortPercent: shortPercent,
            };

        } catch (e: any) {
            return { exchange: exchangeId, status: 'Error', message: e.message };
        }
    }

    // --- Special handling for Gate.io ---
    if (exchangeId === 'gateio') {
        try {
            const contract = `${requestedSymbol}_USDT`;
            const interval = timeframeMap.gateio[uiTimeframe];
            if (!interval) {
                 return { exchange: exchangeId, status: 'Error', message: `Timeframe '${uiTimeframe}' not supported.` };
            }

            const response = await axios.get(`https://api.gateio.ws/api/v4/futures/usdt/contract_stats?contract=${contract}&interval=${interval}`);
            
            const latestData = response.data?.[0];
            if (!latestData || !latestData.top_lsr_account) {
                return { exchange: exchangeId, status: 'Error', message: 'No data returned from Gate.io API.' };
            }

            const ratio = latestData.top_lsr_account;
            // Derive percentages from the ratio: Short = 1 / (Ratio + 1), Long = 1 - Short
            const short = 1 / (ratio + 1);
            const long = 1 - short;
            const longPercent = long * 100;
            const shortPercent = short * 100;

            return {
                exchange: exchangeId,
                status: 'Success',
                longShortRatio: ratio,
                longPercent: longPercent,
                shortPercent: shortPercent,
            };
        } catch (e: any) {
            return { exchange: exchangeId, status: 'Error', message: e.message };
        }
    }

    // --- Standard CCXT logic for all other exchanges ---
    // 1. Check if the timeframe is supported and get the correct format
    const exchangeTimeframes = timeframeMap[exchangeId];
    if (!exchangeTimeframes || !exchangeTimeframes[uiTimeframe]) {
        return { exchange: exchangeId, status: 'Error', message: `Timeframe '${uiTimeframe}' not supported.` };
    }
    const exchangeSpecificTimeframe = exchangeTimeframes[uiTimeframe];

    try {
      const isBybit = exchangeId === 'bybit';
      
      // Construct the correct symbol format for each exchange type
      const symbol = isBybit ? `${requestedSymbol}USDT` : `${requestedSymbol}/USDT:USDT`;
      const exchangeOptions = isBybit ? { 'defaultType': 'swap' } : {};
      const exchange = new ccxt[exchangeId](exchangeOptions);

      if (exchange.has['fetchLongShortRatioHistory']) {
        const params = isBybit ? { 'type': 'swap' } : {};
        // Use the dynamic timeframe from the query parameters
        const history = await exchange.fetchLongShortRatioHistory(symbol, exchangeSpecificTimeframe, undefined, 1, params);
        
        if (history.length === 0) {
            return { exchange: exchangeId, status: 'Error', message: 'Exchange returned no data.' };
        }

        const latestRatioData = history[0];
        const { longPercent, shortPercent } = parseExchangeData(exchangeId, latestRatioData);
        
        return {
          exchange: exchangeId,
          status: 'Success',
          longShortRatio: latestRatioData.longShortRatio,
          longPercent: longPercent,
          shortPercent: shortPercent,
          info: latestRatioData.info,
        };
      } else {
        return { exchange: exchangeId, status: 'Not Supported' };
      }
    } catch (e: any) {
      return { exchange: exchangeId, status: 'Error', message: e.message };
    }
  });

  const results = await Promise.all(promises);
  return NextResponse.json(results);
}
