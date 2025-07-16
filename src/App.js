// SmartSignal v3.1 - Hook Warning Fix
import React, { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const SYMBOLS = [
  'R_100', 'R_75_1s', 'R_150', 'R_250', 'Boom_1000_Index', 'Crash_1000_Index',
  'Bull_Market_Index', 'Bear_Market_Index', 'Step_Index', 'Step_100_Index', 'Volatility_10_Index'
];

export default function SignalChart() {
  const [data, setData] = useState([]);
  const [latestSignal, setLatestSignal] = useState(null);
  const [symbol, setSymbol] = useState('R_100');
  const [token, setToken] = useState('');
  const [tradeLog, setTradeLog] = useState([]);
  const [cooldownTime, setCooldownTime] = useState({});
  const [lotSize, setLotSize] = useState(1);

  const playSound = (type) => {
    const audio = new Audio(type === 'BUY' ? '/buy.mp3' : '/sell.mp3');
    audio.play().catch(() => {});
  };

  const executeTrade = useCallback(async (type) => {
    if (!token || !symbol) return;
    const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');

    ws.onopen = () => {
      ws.send(JSON.stringify({ authorize: token }));
    };

    ws.onmessage = (msg) => {
      const res = JSON.parse(msg.data);
      if (res.msg_type === 'authorize') {
        ws.send(JSON.stringify({
          buy: 1,
          price: 0.35,
          parameters: {
            amount: lotSize,
            basis: "stake",
            contract_type: type === "BUY" ? "CALL" : "PUT",
            currency: "USD",
            duration: 1,
            duration_unit: "m",
            symbol: symbol
          }
        }));
      } else if (res.msg_type === 'buy') {
        const contractId = res?.buy?.contract_id;
        if (contractId) {
          setTradeLog(prev => [...prev, `✅ ${type} Executed: ${contractId}`]);
        } else {
          setTradeLog(prev => [...prev, `⚠️ ${type} Executed but no contract_id in response.`]);
        }
      } else if (res.error) {
        setTradeLog(prev => [...prev, `❌ ${type} Failed: ${res.error.message}`]);
      }
    };
  }, [token, symbol, lotSize]);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');

    ws.onopen = () => {
      ws.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 300,
        end: "latest",
        start: 1,
        style: "candles",
        granularity: 300,
        subscribe: 1
      }));
    };

    ws.onmessage = (msg) => {
      const response = JSON.parse(msg.data);
      if (response?.candles) {
        const chartData = response.candles.map(c => ({
          time: new Date(c.epoch * 1000).toLocaleTimeString(),
          open: +c.open,
          high: +c.high,
          low: +c.low,
          close: +c.close
        }));
        setData(chartData);

        const now = Date.now();
        for (let i = 50; i < chartData.length; i++) {
          const prices = chartData.slice(i - 20, i);
          const ema20 = prices.reduce((acc, p, j) => acc + p.close * (2 / (20 + 1)) * Math.pow(1 - (2 / (20 + 1)), j), 0);
          const ema50 = prices.reduce((acc, p, j) => acc + p.close * (2 / (50 + 1)) * Math.pow(1 - (2 / (50 + 1)), j), 0);
          const price = chartData[i].close;

          const lastTime = cooldownTime[symbol];
          if (price > ema20 && ema20 > ema50) {
            if (!lastTime || now - lastTime > 5 * 60 * 1000) {
              setCooldownTime(prev => ({ ...prev, [symbol]: now }));
              setLatestSignal({ index: i, type: 'BUY' });
              playSound('BUY');
              executeTrade('BUY');
              break;
            }
          } else if (price < ema20 && ema20 < ema50) {
            if (!lastTime || now - lastTime > 5 * 60 * 1000) {
              setCooldownTime(prev => ({ ...prev, [symbol]: now }));
              setLatestSignal({ index: i, type: 'SELL' });
              playSound('SELL');
              executeTrade('SELL');
              break;
            }
          }
        }
      }
    };

    return () => ws.close();
  }, [symbol, token, cooldownTime, executeTrade]);

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-bold">📈 SmartSignal Chart + Auto Trading</h2>

      <div className="mb-4">
        <label className="mr-2 font-medium">🔐 Deriv API Token:</label>
        <input type="password" className="border px-2 py-1 w-[400px]" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your API token here" />
        <button className="ml-2 px-4 py-1 bg-green-600 text-white rounded" onClick={() => alert('Token connected')}>Connect</button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div>
          <label className="mr-2 font-medium">Instrument:</label>
          <select value={symbol} onChange={e => setSymbol(e.target.value)} className="border px-2 py-1">
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="mr-2 font-medium">Lot Size:</label>
          <input type="number" className="border px-2 py-1 w-[80px]" value={lotSize} onChange={e => setLotSize(+e.target.value)} />
        </div>
        <div>
          <button onClick={() => executeTrade('BUY')} className="bg-blue-500 text-white px-4 py-1 rounded">🟢 Manual Buy</button>
          <button onClick={() => executeTrade('SELL')} className="bg-red-500 text-white px-4 py-1 ml-2 rounded">🔴 Manual Sell</button>
        </div>
      </div>

      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="time" hide />
            <YAxis domain={['auto', 'auto']} />
            <Tooltip />
            <Line type="monotone" dataKey="close" stroke="#8884d8" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h3 className="text-lg font-semibold mb-2">📋 Signal Dashboard</h3>
        <table className="table-auto w-full border">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 border">Instrument</th>
              <th className="px-4 py-2 border">Time</th>
              <th className="px-4 py-2 border">Signal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-2 border">{symbol}</td>
              <td className="px-4 py-2 border">{latestSignal ? data[latestSignal.index]?.time : '-'}</td>
              <td className={`px-4 py-2 border font-bold ${latestSignal?.type === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                {latestSignal ? latestSignal.type : 'No Signal'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50 p-4 mt-4 rounded shadow">
        <h3 className="font-bold mb-2">📄 Trade Log</h3>
        <ul className="list-disc list-inside text-sm space-y-1">
          {tradeLog.slice(-10).reverse().map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
