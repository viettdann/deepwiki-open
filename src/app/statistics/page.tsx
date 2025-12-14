'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatsHeader from '@/components/statistics/StatsHeader';
import StatCard from '@/components/statistics/StatCard';
import TokenBreakdown from '@/components/statistics/TokenBreakdown';
import UsageTrend from '@/components/statistics/UsageTrend';
import RoleTable from '@/components/statistics/RoleTable';
import UserLeaderboard from '@/components/statistics/UserLeaderboard';
import ModelUsage from '@/components/statistics/ModelUsage';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import '@/styles/statistics.css';

interface OverviewData {
  total_repos: number;
  total_users: number;
  total_embedding_chunks: number;
  total_embedding_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  total_requests: number;
  requests_today: number;
  requests_week: number;
  requests_month: number;
}

export default function StatisticsPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState<'all' | 'day' | 'week' | 'month'>('all');

  // Check authentication
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
  }, [isAuthenticated, router]);

  // Fetch overview data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/statistics/overview');
        if (!res.ok) throw new Error('Failed to fetch statistics');
        const data = await res.json();
        setOverview(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <Header
        currentPage="statistics"
        title="DeepWiki"
        subtitle="System statistics"
        statusLabel="SYSTEM.STATUS"
        statusValue={loading ? 'LOADING' : 'ONLINE'}
      />
      <div className="stats-dashboard">
        <StatsHeader
          onRefresh={handleRefresh}
          period={period}
          onPeriodChange={setPeriod}
          isLoading={loading}
        />

        {error && (
          <div className="stats-error">
            <div className="error-content">
              <span className="error-icon">▸</span>
              <span className="error-text">{error}</span>
            </div>
          </div>
        )}

        {loading && !overview ? (
          <div className="stats-loading">
            <div className="loading-spinner"></div>
            <span>INITIALIZING SYSTEM...</span>
          </div>
        ) : overview ? (
          <>
            {/* Overview Cards */}
            <section className="stats-section overview-cards">
              <h2 className="section-title section-title-with-lights">
                <span className="traffic-lights">
                  <span className="traffic-light-dot red" />
                  <span className="traffic-light-dot yellow" />
                  <span className="traffic-light-dot green" />
                </span>
                <span>▸ SYSTEM OVERVIEW</span>
              </h2>
              <div className="cards-grid">
                <StatCard
                  label="Repositories"
                  value={overview.total_repos}
                  icon="◐"
                  delay={0}
                />
                <StatCard
                  label="Active Users"
                  value={overview.total_users}
                  icon="◑"
                  delay={0.1}
                />
                <StatCard
                  label="Total Tokens"
                  value={overview.total_tokens}
                  icon="◒"
                  delay={0.2}
                />
                <StatCard
                  label="Total Cost"
                  value={`$${overview.total_cost.toFixed(2)}`}
                  icon="◓"
                  delay={0.3}
                />
                <StatCard
                  label="Today Requests"
                  value={overview.requests_today}
                  icon="→"
                  delay={0.4}
                />
                <StatCard
                  label="Month Requests"
                  value={overview.requests_month}
                  icon="›"
                  delay={0.5}
                />
              </div>
            </section>

            {/* Charts Section */}
            <section className="stats-section charts-section">
              <div className="charts-grid">
                <div className="chart-container">
                  <h3 className="chart-title">▸ TOKEN DISTRIBUTION</h3>
                  <TokenBreakdown
                    embeddingChunks={overview.total_embedding_chunks}
                    embeddingTokens={overview.total_embedding_tokens}
                    promptTokens={overview.total_prompt_tokens}
                    completionTokens={overview.total_completion_tokens}
                  />
                </div>

                <div className="chart-container">
                  <h3 className="chart-title">▸ USAGE TRENDS</h3>
                  <UsageTrend period={period} />
                </div>
              </div>
            </section>

            {/* Analytics Tables */}
            <section className="stats-section">
              <h2 className="section-title">▸ ROLE ANALYSIS</h2>
              <RoleTable />
            </section>

            <section className="stats-section">
              <h2 className="section-title">▸ USER LEADERBOARD</h2>
              <UserLeaderboard />
            </section>

            <section className="stats-section">
              <h2 className="section-title">▸ MODEL USAGE</h2>
              <ModelUsage />
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
