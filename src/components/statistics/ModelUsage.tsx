'use client';

import { useEffect, useState } from 'react';
import styles from './StatisticsWidgets.module.css';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import common from './StatisticsCommon.module.css';

interface ModelData {
  model: string;
  provider: string;
  request_count: number;
  total_tokens: number;
  total_cost: number;
}

export default function ModelUsage() {
  const [models, setModels] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'chart' | 'list'>('chart');

  const COLORS = {
    cost: '#8b5cf6',
    tokens: '#3b82f6',
  };

  useEffect(() => {
    const fetchModelData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/statistics/models');
        if (!res.ok) throw new Error('Failed to fetch model data');
        const data = await res.json();
        setModels(data.slice(0, 10)); // Top 10 models
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchModelData();
  }, []);

  if (loading) {
    return <div className={styles.modelLoading}>LOADING MODEL DATA...</div>;
  }

  if (error) {
    return <div className={styles.modelError}>ERROR: {error}</div>;
  }

  if (models.length === 0) {
    return <div className={styles.modelEmpty}>NO MODEL DATA AVAILABLE</div>;
  }

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ModelData }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className={common.terminalTooltip}>
          <p className={common.tooltipLabel}>{data.payload.model}</p>
          <p className={common.tooltipItem}>Requests: {data.payload.request_count}</p>
          <p className={common.tooltipItem}>
            Tokens: {data.payload.total_tokens.toLocaleString()}
          </p>
          <p className={common.tooltipItem}>Cost: ${data.payload.total_cost.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.modelUsageContainer}>
      <div className={styles.modelControls}>
        <button
          className={`${styles.viewBtn} ${view === 'chart' ? styles.active : ''}`}
          onClick={() => setView('chart')}
        >
          📊 CHART
        </button>
        <button
          className={`${styles.viewBtn} ${view === 'list' ? styles.active : ''}`}
          onClick={() => setView('list')}
        >
          📋 LIST
        </button>
      </div>

      {view === 'chart' ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={models}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.5} />
            <XAxis
              dataKey="model"
              stroke="#3b82f6"
              style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }}
            />
            {/* Tokens axis (left) */}
            <YAxis
              yAxisId="tokens"
              stroke={COLORS.tokens}
              style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }}
              tickFormatter={(v) => v.toLocaleString()}
            />
            {/* Cost axis (right) */}
            <YAxis
              yAxisId="cost"
              orientation="right"
              stroke={COLORS.cost}
              style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }}
              tickFormatter={(v) => `$${v.toFixed(2)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              yAxisId="tokens"
              dataKey="total_tokens"
              fill={COLORS.tokens}
              name="Tokens"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="cost"
              dataKey="total_cost"
              fill={COLORS.cost}
              name="Cost (USD)"
              minPointSize={4}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className={styles.modelList}>
          <table className="terminal-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Model</th>
                <th>Provider</th>
                <th>Requests</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model, idx) => (
                <tr
                  key={`${model.model}-${model.provider}`}
                  className={idx % 2 === 0 ? 'even' : 'odd'}
                >
                  <td>{idx + 1}</td>
                  <td className="model-name">{model.model}</td>
                  <td className={styles.providerName}>
                    <span className={styles.providerTag}>{model.provider}</span>
                  </td>
                  <td>{model.request_count}</td>
                  <td>{model.total_tokens.toLocaleString()}</td>
                  <td className={styles.costCell}>${model.total_cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'chart' && (
        <div className={styles.modelLegend}>
          <div className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ backgroundColor: COLORS.tokens }}></span>
            <span>Tokens</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ backgroundColor: COLORS.cost }}></span>
            <span>Cost (USD)</span>
          </div>
          <span className={styles.legendNote}>* Cost bars always show (min height)</span>
        </div>
      )}

      {view === 'chart' && (
        <div className={styles.modelBadges}>
          {models.map((model) => (
            <span key={`${model.model}-${model.provider}`} className={styles.modelBadge}>
              <span className={styles.badgeDot} />
              {model.model}
              <span className={styles.badgeSub}>[{model.provider}]</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
