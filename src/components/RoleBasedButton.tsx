/**
 * Role-Based Button Component
 *
 * Handles permission-based UI for admin/readonly users
 * - Admin: Executes action on click
 * - Readonly: Shows PermissionDeniedModal on click
 *
 * Matches AGENTS.themes.md Terminal Codex aesthetic
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PermissionDeniedModal } from './PermissionDeniedModal';

interface RoleBasedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Action to execute if user has permission (admin) */
  onAdminClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Human-readable action description for permission denied modal */
  actionDescription: string;
  /** Require admin role (default: true). Set to false to allow any authenticated user */
  requireAdmin?: boolean;
  /** Children to render inside button */
  children: React.ReactNode;
}

/**
 * Role-based button that shows permission modal for readonly users
 *
 * @example
 * <RoleBasedButton
 *   onAdminClick={handleDelete}
 *   actionDescription="delete job"
 *   className="btn-danger"
 * >
 *   Delete
 * </RoleBasedButton>
 */
export function RoleBasedButton({
  onAdminClick,
  actionDescription,
  requireAdmin = true,
  children,
  ...buttonProps
}: RoleBasedButtonProps) {
  const { user, loginRequired } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    // If login not required, treat as admin
    if (!loginRequired) {
      onAdminClick(e);
      return;
    }

    // Check if user has permission
    const hasPermission = requireAdmin
      ? user?.access === 'admin'
      : user !== null; // Any authenticated user

    if (hasPermission) {
      onAdminClick(e);
    } else {
      // Show permission denied modal
      setShowModal(true);
    }
  }, [user, loginRequired, requireAdmin, onAdminClick]);

  return (
    <>
      <button
        {...buttonProps}
        onClick={handleClick}
      >
        {children}
      </button>

      <PermissionDeniedModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        action={actionDescription}
      />
    </>
  );
}

/**
 * Hook to create role-based action handlers for non-button elements
 *
 * @example
 * const handleAction = useRoleBasedAction({
 *   onAdminAction: handleDelete,
 *   actionDescription: "delete project"
 * });
 *
 * <div onClick={handleAction}>Delete</div>
 */
export function useRoleBasedAction({
  onAdminAction,
  actionDescription,
  requireAdmin = true,
}: {
  onAdminAction: () => void;
  actionDescription: string;
  requireAdmin?: boolean;
}) {
  const { user, loginRequired } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const handleAction = useCallback(() => {
    // If login not required, treat as admin
    if (!loginRequired) {
      onAdminAction();
      return;
    }

    // Check if user has permission
    const hasPermission = requireAdmin
      ? user?.access === 'admin'
      : user !== null;

    if (hasPermission) {
      onAdminAction();
    } else {
      setShowModal(true);
    }
  }, [user, loginRequired, requireAdmin, onAdminAction]);

  const modal = (
    <PermissionDeniedModal
      isOpen={showModal}
      onClose={() => setShowModal(false)}
      action={actionDescription}
    />
  );

  return { handleAction, modal, hasPermission: user?.access === 'admin' };
}
