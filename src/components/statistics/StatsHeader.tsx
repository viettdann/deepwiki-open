'use client';

import styles from './StatsHeader.module.css';

interface StatsHeaderProps {
  onRefresh: () => void;
  period: 'all' | 'day' | 'week' | 'month';
  onPeriodChange: (period: 'all' | 'day' | 'week' | 'month') => void;
  isLoading: boolean;
}

export default function StatsHeader({
  onRefresh,
  period,
  onPeriodChange,
  isLoading,
}: StatsHeaderProps) {
  const periods: Array<{ value: 'all' | 'day' | 'week' | 'month'; label: string }> = [
    { value: 'all', label: 'ALL TIME' },
    { value: 'day', label: 'TODAY' },
    { value: 'week', label: 'WEEK' },
    { value: 'month', label: 'MONTH' },
  ];

  return (
    <header className={styles.statsHeader}>
      <div className={styles.headerChrome}>
        <div className={styles.trafficLights}>
          <div className="traffic-light-dot red" />
          <div className="traffic-light-dot yellow" />
          <div className="traffic-light-dot green" />
        </div>
        <div className={styles.windowTitle}>SYSTEM STATISTICS</div>
        <div className={styles.headerControls}>
          <span className={`${styles.liveIndicator} ${isLoading ? '' : styles.online}`}>
            {isLoading ? 'LOADING' : 'LIVE'}
          </span>
        </div>
      </div>

      <div className={styles.headerContent}>
        <div className={styles.periodSelector}>
          <span className={styles.selectorLabel}>▸ PERIOD:</span>
          <div className={styles.buttonGroup}>
            {periods.map((p) => (
              <button
                key={p.value}
                className={`${styles.periodBtn} ${period === p.value ? styles.active : ''}`}
                onClick={() => onPeriodChange(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className={`${styles.refreshBtn} ${isLoading ? styles.loading : ''}`}
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh data"
        >
          <span className={styles.refreshIcon}>↻</span>
          <span className="refresh-text">REFRESH</span>
        </button>
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>MODE</span>
          <span className={styles.statusValue}>ADMIN</span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>TIME</span>
          <span className={styles.statusValue} id="current-time">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>STATUS</span>
          <span className={styles.statusValue}>ONLINE</span>
        </div>
      </div>
    </header>
  );
}
