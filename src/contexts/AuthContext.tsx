/**
 * Auth Context
 *
 * Client-side auth state management for reactivity
 * Server is source of truth - context syncs from server on mount
 */
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface User {
  id: string;
  username: string;
  role: string;                    // dev, po, pm, devops (identity)
  access: 'admin' | 'readonly';    // permission
  allowed_models?: string[] | null;
  budget_monthly_usd?: number | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginRequired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginRequired, setLoginRequired] = useState(false);

  // Fetch current user from server
  const fetchUser = useCallback(async () => {
    try {
      // Check if login is required (prevent caching)
      const loginReqRes = await fetch('/api/auth/login-required', {
        cache: 'no-store'
      });
      if (loginReqRes.ok) {
        const { required } = await loginReqRes.json();
        setLoginRequired(required);

        // If login not required, don't fetch user
        if (!required) {
          setUser(null);
          setIsLoading(false);
          return;
        }
      }

      // Fetch current user (prevent caching)
      const res = await fetch('/api/auth/me', {
        cache: 'no-store'
      });

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch user on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Login
  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Login failed');
    }

    const data = await res.json();
    setUser(data.user);
  }, []);

  // Logout
  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  // Refetch user
  const refetch = useCallback(async () => {
    setIsLoading(true);
    await fetchUser();
  }, [fetchUser]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    loginRequired,
    login,
    logout,
    refetch
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
