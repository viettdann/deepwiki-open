'use client';

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
    <header className="stats-header">
      <div className="header-chrome">
        <div className="traffic-lights">
          <div className="traffic-light-dot red"></div>
          <div className="traffic-light-dot yellow"></div>
          <div className="traffic-light-dot green"></div>
        </div>
        <div className="window-title">SYSTEM STATISTICS</div>
        <div className="header-controls">
          <span className={`live-indicator ${isLoading ? '' : 'online'}`}>
            {isLoading ? 'LOADING' : 'LIVE'}
          </span>
        </div>
      </div>

      <div className="header-content">
        <div className="period-selector">
          <span className="selector-label">▸ PERIOD:</span>
          <div className="button-group">
            {periods.map((p) => (
              <button
                key={p.value}
                className={`period-btn ${period === p.value ? 'active' : ''}`}
                onClick={() => onPeriodChange(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className={`refresh-btn ${isLoading ? 'loading' : ''}`}
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh data"
        >
          <span className="refresh-icon">↻</span>
          <span className="refresh-text">REFRESH</span>
        </button>
      </div>

      <div className="status-bar">
        <div className="status-item">
          <span className="status-label">MODE</span>
          <span className="status-value">ADMIN</span>
        </div>
        <div className="status-item">
          <span className="status-label">TIME</span>
          <span className="status-value" id="current-time">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">STATUS</span>
          <span className="status-value">ONLINE</span>
        </div>
      </div>
    </header>
  );
}
