'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

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
    cost: '#a855f7',
    tokens: '#22d3ee',
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
    return <div className="model-loading">LOADING MODEL DATA...</div>;
  }

  if (error) {
    return <div className="model-error">ERROR: {error}</div>;
  }

  if (models.length === 0) {
    return <div className="model-empty">NO MODEL DATA AVAILABLE</div>;
  }

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ModelData }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="terminal-tooltip">
          <p className="tooltip-label">{data.payload.model}</p>
          <p className="tooltip-item">Requests: {data.payload.request_count}</p>
          <p className="tooltip-item">Tokens: {data.payload.total_tokens.toLocaleString()}</p>
          <p className="tooltip-item">Cost: ${data.payload.total_cost.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="model-usage-container">
      <div className="model-controls">
        <button
          className={`view-btn ${view === 'chart' ? 'active' : ''}`}
          onClick={() => setView('chart')}
        >
          📊 CHART
        </button>
        <button
          className={`view-btn ${view === 'list' ? 'active' : ''}`}
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
              stroke="#22d3ee"
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
        <div className="model-list">
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
                <tr key={`${model.model}-${model.provider}`} className={idx % 2 === 0 ? 'even' : 'odd'}>
                  <td>{idx + 1}</td>
                  <td className="model-name">{model.model}</td>
                  <td className="provider-name">
                    <span className="provider-tag">{model.provider}</span>
                  </td>
                  <td>{model.request_count}</td>
                  <td>{model.total_tokens.toLocaleString()}</td>
                  <td className="cost-cell">${model.total_cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'chart' && (
        <div className="model-legend">
          <div className="legend-item">
            <span className="legend-swatch" style={{ backgroundColor: COLORS.tokens }}></span>
            <span>Tokens</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch" style={{ backgroundColor: COLORS.cost }}></span>
            <span>Cost (USD)</span>
          </div>
          <span className="legend-note">* Cost bars always show (min height)</span>
        </div>
      )}

      {view === 'chart' && (
        <div className="model-badges">
          {models.map((model) => (
            <span key={`${model.model}-${model.provider}`} className="model-badge">
              <span className="badge-dot" />
              {model.model}
              <span className="badge-sub">[{model.provider}]</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
