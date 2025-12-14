'use client';

import { useEffect, useState } from 'react';

interface UserData {
  user_id: string;
  username: string;
  role: string;
  access: 'admin' | 'readonly';
  total_tokens: number;
  total_cost: number;
  request_count: number;
  budget_used: number;
  budget_limit: number | null;
  last_active: string;
}

type SortField = 'username' | 'tokens' | 'cost' | 'requests';

export default function UserLeaderboard() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('tokens');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        setError(null);

        const sortMap: Record<SortField, string> = {
          username: 'username',
          tokens: 'tokens',
          cost: 'cost',
          requests: 'requests',
        };

        const res = await fetch(
          `/api/statistics/by-user?sort=${sortMap[sortField]}&order=${sortOrder}&limit=1000`
        );
        if (!res.ok) throw new Error('Failed to fetch user data');

        const data = await res.json();
        setUsers(data);
        setPage(0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return 'N/A';
    }
  };

  const formatBudget = (used: number, limit: number | null) => {
    if (limit === null || limit === -1) {
      return 'UNLIMITED';
    }
    const percentage = Math.round((used / limit) * 100);
    return `${percentage}%`;
  };

  if (loading) {
    return <div className="table-loading">LOADING USER DATA...</div>;
  }

  if (error) {
    return <div className="table-error">ERROR: {error}</div>;
  }

  if (users.length === 0) {
    return <div className="table-empty">NO USER DATA AVAILABLE</div>;
  }

  const paginatedUsers = users.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(users.length / pageSize);

  return (
    <div className="user-leaderboard-container">
      <div className="table-wrapper">
        <table className="terminal-table user-table">
          <thead>
            <tr>
              <th>#</th>
              <th onClick={() => handleSort('username')} className="sortable">
                Username {sortField === 'username' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th>Role</th>
              <th>Access</th>
              <th onClick={() => handleSort('tokens')} className="sortable">
                Tokens {sortField === 'tokens' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th onClick={() => handleSort('cost')} className="sortable">
                Cost {sortField === 'cost' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th>Budget</th>
              <th onClick={() => handleSort('requests')} className="sortable">
                Requests {sortField === 'requests' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>
            {paginatedUsers.map((user, idx) => (
              <tr key={user.user_id} className={idx % 2 === 0 ? 'even' : 'odd'}>
                <td className="rank">{page * pageSize + idx + 1}</td>
                <td className="username">{user.username}</td>
                <td className="role">
                  <span className={`role-tag ${user.role}`}>{user.role.toUpperCase()}</span>
                </td>
                <td className="access">
                  <span className={`access-tag ${user.access}`}>
                    {user.access === 'admin' ? '👤' : '🔒'}
                  </span>
                </td>
                <td className="tokens">{user.total_tokens.toLocaleString()}</td>
                <td className="cost">${user.total_cost.toFixed(2)}</td>
                <td className="budget">
                  <div className="budget-bar">
                    <div
                      className="budget-fill"
                      style={{
                        width: user.budget_limit && user.budget_limit > 0
                          ? `${Math.min((user.budget_used / user.budget_limit) * 100, 100)}%`
                          : '0%',
                      }}
                    ></div>
                  </div>
                  <span className="budget-text">
                    {formatBudget(user.budget_used, user.budget_limit)}
                  </span>
                </td>
                <td className="requests">{user.request_count}</td>
                <td className="last-active">{formatDate(user.last_active)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="page-btn"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
          >
            ◀ PREV
          </button>
          <span className="page-info">
            PAGE {page + 1} / {totalPages}
          </span>
          <button
            className="page-btn"
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page === totalPages - 1}
          >
            NEXT ▶
          </button>
        </div>
      )}
    </div>
  );
}
