'use client';

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import common from './StatisticsCommon.module.css';
import styles from './StatisticsWidgets.module.css';

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
    { name: 'Prompt Tokens', value: promptTokens, percentage: 0 },
    { name: 'Completion Tokens', value: completionTokens, percentage: 0 },
  ];

  const total = promptTokens + completionTokens;
  if (total > 0) {
    data.forEach((item) => {
      item.percentage = Math.round((item.value / total) * 100);
    });
  }

  const COLORS = ['#a855f7', '#ec4899'];

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { percentage: number } }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className={common.terminalTooltip}>
          <p className={common.tooltipLabel}>{data.name}</p>
          <p className={common.tooltipItem}>
            {data.value.toLocaleString()} ({data.payload.percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.tokenBreakdown}>
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
              color: '#00a8cc',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className={styles.breakdownLegend}>
        <div className="legend-item">
          <span className={`${styles.legendIcon} ${styles.legendIconPrompt}`}></span>
          <span className={styles.legendText}>Prompt: {promptTokens.toLocaleString()}</span>
        </div>
        <div className="legend-item">
          <span className={`${styles.legendIcon} ${styles.legendIconCompletion}`}></span>
          <span className={styles.legendText}>Completion: {completionTokens.toLocaleString()}</span>
        </div>
      </div>

      {(embeddingTokens > 0 || embeddingChunks > 0) && (
        <div className={styles.chunkInfo}>
          <div className={styles.chunkItem}>
            <span className={styles.chunkLabel}>Embedding Tokens</span>
            <span className={styles.chunkValue}>{embeddingTokens.toLocaleString()}</span>
          </div>

          {embeddingChunks > 0 && (
            <div className={styles.chunkItem}>
              <span className={styles.chunkLabel}>Chunks Generated</span>
              <span className={styles.chunkValue}>{embeddingChunks.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
