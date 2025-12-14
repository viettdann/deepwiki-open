'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import common from './StatisticsCommon.module.css';
import styles from './StatisticsWidgets.module.css';

interface TrendData {
  date: string;
  tokens: number;
  cost: number;
  requests: number;
}

interface UsageTrendProps {
  period: 'all' | 'day' | 'week' | 'month';
}

export default function UsageTrend({ period }: UsageTrendProps) {
  const [data, setData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        setLoading(true);

        const days = period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 90;
        const trendPeriod = period === 'day' ? 'day' : period === 'week' ? 'week' : 'month';

        const res = await fetch(
          `/api/statistics/trends?period=${trendPeriod}&days=${days}`
        );
        if (!res.ok) throw new Error('Failed to fetch trends');

        const trends = await res.json();
        setData(trends);
      } catch (err) {
        console.error('Error fetching trends:', err);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrends();
  }, [period]);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: TrendData }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className={common.terminalTooltip}>
          <p className={common.tooltipLabel}>{payload[0].payload.date}</p>
          <p className={common.tooltipItemCyan}>
            Tokens: {payload[0].value.toLocaleString()}
          </p>
          {payload[1] && (
            <p className={common.tooltipItemPurple}>
              Cost: ${payload[1].value.toFixed(2)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className={styles.trendLoading}>
        <span>FETCHING TRENDS...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={styles.trendEmpty}>
        <span>NO DATA AVAILABLE</span>
      </div>
    );
  }

  return (
    <div className={styles.usageTrend}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00a8cc" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#00a8cc" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.5} />
          <XAxis
            dataKey="date"
            stroke="#00a8cc"
            style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <YAxis
            stroke="#a855f7"
            style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              color: '#00a8cc',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
            }}
          />
          <Line
            type="monotone"
            dataKey="tokens"
            stroke="#00a8cc"
            strokeWidth={2}
            dot={false}
            fillOpacity={1}
            fill="url(#colorTokens)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cost"
            stroke="#a855f7"
            strokeWidth={2}
            dot={false}
            fillOpacity={1}
            fill="url(#colorCost)"
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
