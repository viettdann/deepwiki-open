'use client';

import { useEffect, useState } from 'react';
import common from './StatisticsCommon.module.css';
import styles from './StatisticsWidgets.module.css';

interface RoleData {
  role: string;
  display_name: string;
  user_count: number;
  total_tokens: number;
  total_cost: number;
  total_requests: number;
  avg_tokens_per_user: number;
  avg_cost_per_user: number;
}

export default function RoleTable() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRoleData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/statistics/by-role');
        if (!res.ok) throw new Error('Failed to fetch role data');
        const data = await res.json();
        setRoles(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchRoleData();
  }, []);

  if (loading) {
    return <div className={common.tableLoading}>LOADING ROLE DATA...</div>;
  }

  if (error) {
    return <div className={common.tableError}>ERROR: {error}</div>;
  }

  if (roles.length === 0) {
    return <div className={common.tableEmpty}>NO ROLE DATA AVAILABLE</div>;
  }

  const maxCost = Math.max(...roles.map((r) => r.total_cost));

  return (
    <div className={styles.roleTableContainer}>
      <table className={`terminal-table ${styles.roleTable}`}>
        <thead>
          <tr>
            <th>Role</th>
            <th>Users</th>
            <th>Tokens</th>
            <th>Cost</th>
            <th>Avg/User</th>
            <th>Requests</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.role} className={styles.roleRow}>
              <td className="role-name">
                <span className={styles.roleBadge}>{role.display_name}</span>
              </td>
              <td className="role-users">{role.user_count}</td>
              <td className="role-tokens">{role.total_tokens.toLocaleString()}</td>
              <td className="role-cost">
                <div className={styles.costCell}>
                  <div className={styles.costBar}>
                    <div
                      className={styles.costFill}
                      style={{
                        width: `${Math.min((role.total_cost / maxCost) * 100, 100)}%`,
                      }}
                    ></div>
                  </div>
                  <span className={styles.costValue}>${role.total_cost.toFixed(2)}</span>
                </div>
              </td>
              <td className="role-avg">${role.avg_cost_per_user.toFixed(2)}</td>
              <td className="role-requests">{role.total_requests}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
