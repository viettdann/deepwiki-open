/**
 * Permission Context
 *
 * Global state management for permission denied modal
 * Allows any component to trigger the permission denied modal
 */
'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { PermissionDeniedModal } from '@/components/PermissionDeniedModal';

interface PermissionContextType {
  showPermissionDenied: (action?: string) => void;
  hidePermissionDenied: () => void;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [action, setAction] = useState<string>('perform this action');

  const showPermissionDenied = useCallback((actionText?: string) => {
    if (actionText) setAction(actionText);
    setIsOpen(true);
  }, []);

  const hidePermissionDenied = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <PermissionContext.Provider value={{ showPermissionDenied, hidePermissionDenied }}>
      {children}
      <PermissionDeniedModal
        isOpen={isOpen}
        onClose={hidePermissionDenied}
        action={action}
      />
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermission must be used within a PermissionProvider');
  }
  return context;
}
