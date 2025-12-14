'use client';

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';

interface TokenBreakdownProps {
  embeddingChunks: number;
  embeddingTokens: number;
  promptTokens: number;
  completionTokens: number;
}

interface PieLabelProps {
  index: number;
}

export default function TokenBreakdown({
  embeddingChunks,
  embeddingTokens,
  promptTokens,
  completionTokens,
}: TokenBreakdownProps) {
  const data = [
    { name: 'Embedding Tokens', value: embeddingTokens, percentage: 0 },
    { name: 'Prompt Tokens', value: promptTokens, percentage: 0 },
    { name: 'Completion Tokens', value: completionTokens, percentage: 0 },
  ];

  const total = embeddingTokens + promptTokens + completionTokens;
  data.forEach((item) => {
    item.percentage = Math.round((item.value / total) * 100);
  });

  const COLORS = ['#22d3ee', '#a855f7', '#ec4899'];

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { percentage: number } }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="terminal-tooltip">
          <p className="tooltip-label">{data.name}</p>
          <p className="tooltip-value">
            {data.value.toLocaleString()} ({data.payload.percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="token-breakdown">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(props: PieLabelProps) => `${data[props.index]?.percentage || 0}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              color: '#22d3ee',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="breakdown-legend">
        <div className="legend-item">
          <span className="legend-icon embedding"></span>
          <span className="legend-text">Embedding: {embeddingTokens.toLocaleString()}</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon prompt"></span>
          <span className="legend-text">Prompt: {promptTokens.toLocaleString()}</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon completion"></span>
          <span className="legend-text">Completion: {completionTokens.toLocaleString()}</span>
        </div>
      </div>

      {embeddingChunks > 0 && (
        <div className="chunk-info">
          <span className="chunk-label">Chunks Generated:</span>
          <span className="chunk-value">{embeddingChunks.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
