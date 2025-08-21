'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

// Define the data structure for the Ratio Bars
type LongShortRatioData = {
  exchange: string;
  status: 'Success' | 'Not Supported' | 'Error';
  longShortRatio?: number;
  longPercent?: number;
  shortPercent?: number;
  message?: string;
  info?: any;
};

// Component for the Ratio Bars
const ExchangeRatioBar = ({ data }: { data: LongShortRatioData }) => {
  if (data.status !== 'Success' || data.longPercent == null || data.shortPercent == null) {
    return null; 
  }
  return (
    <div className="flex items-center space-x-4 mb-4">
      <div className="w-24 font-semibold capitalize">{data.exchange.replace('usdm', '')}</div>
      <div className="flex-1">
        <div className="relative h-6 w-full rounded-full overflow-hidden bg-red-200 flex text-white text-xs font-medium">
           <div className="absolute top-0 left-0 h-full bg-green-400 flex items-center justify-center" style={{ width: `${data.longPercent}%` }}>
             <span>{data.longPercent.toFixed(2)}%</span>
           </div>
           <div className="absolute top-0 right-0 h-full bg-red-400 flex items-center justify-center" style={{ width: `${data.shortPercent}%` }}>
             <span>{data.shortPercent.toFixed(2)}%</span>
           </div>
        </div>
      </div>
    </div>
  );
};

// Component for the Taker Volume Summary Cards
const TakerVolumeSummary = ({ symbol }) => {
    const [summaryData, setSummaryData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSummaryData = async () => {
            try {
                setLoading(true);
                const response = await fetch(`/api/taker-volume-summary?symbol=${symbol}`);
                const result = await response.json();
                setSummaryData(result);
            } catch (error) {
                console.error("Failed to fetch taker volume summary", error);
            } finally {
                setLoading(false);
            }
        };
        if (symbol) fetchSummaryData();
    }, [symbol]);

    if (loading) return <p>Loading summary...</p>;
    if (!summaryData) return null;

    return (
        <div>
            <h3 className="text-lg font-semibold mb-2 text-muted-foreground">Long/Short Volume (Binance)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(summaryData).map(([timeframe, data]: [string, any]) => (
                    <Card key={timeframe}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium uppercase">{timeframe}</CardTitle>
                            <div className="text-2xl font-bold">{data.totalVolume}</div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-between text-sm">
                                <span className="text-green-400">Longs</span>
                                <span>{data.longs}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-red-400">Shorts</span>
                                <span>{data.shorts}</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default function LongShortDashboard() {
  const [ratioData, setRatioData] = useState<LongShortRatioData[]>([]);
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState('BTC');
  const [timeframe, setTimeframe] = useState('5m');
  const [availableSymbols, setAvailableSymbols] = useState<string[]>(['BTC']);

  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const response = await fetch('/api/available-markets');
        const result = await response.json();
        if (Array.isArray(result)) setAvailableSymbols(result);
      } catch (error) { console.error("Failed to fetch symbols", error); }
    };
    fetchSymbols();
  }, []);

  useEffect(() => {
    const fetchRatioData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/long-short-ratio?symbol=${symbol}&timeframe=${timeframe}`);
        const result = await response.json();
        setRatioData(result);
      } catch (error) {
        console.error("Failed to fetch ratio data", error);
      } finally { setLoading(false); }
    };
    if (symbol && timeframe) fetchRatioData();
  }, [symbol, timeframe]);

  const displayData = ratioData.filter(item => item.status === 'Success');

  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
             <CardTitle>코인맵 거래소 롱숏 비율 분석</CardTitle>
             <div className="flex space-x-2">
                 <Select value={symbol} onValueChange={setSymbol}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Coin" /></SelectTrigger>
                    <SelectContent>
                        <ScrollArea className="h-72 w-full">
                            {availableSymbols.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                        </ScrollArea>
                    </SelectContent>
                </Select>
                 <Select value={timeframe} onValueChange={setTimeframe}>
                    <SelectTrigger className="w-[100px]"><SelectValue placeholder="Time" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="5m">5m</SelectItem>
                        <SelectItem value="15m">15m</SelectItem>
                        <SelectItem value="30m">30m</SelectItem>
                        <SelectItem value="1h">1h</SelectItem>
                        <SelectItem value="4h">4h</SelectItem>
                        <SelectItem value="1d">1d</SelectItem>
                    </SelectContent>
                </Select>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-2 px-4 text-sm text-muted-foreground">
            <div className="w-24"></div>
            <div className="flex-1 flex justify-between">
                <span>Long</span>
                <span>Short</span>
            </div>
          </div>
          {loading ? <p>Loading data...</p> : displayData.map(item => <ExchangeRatioBar key={item.exchange} data={item} />)}
        </CardContent>
      </Card>

      <TakerVolumeSummary symbol={symbol} />
    </div>
  );
}
