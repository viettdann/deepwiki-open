'use client';

import React from 'react';
import styles from './ErrorResponse.module.css';

interface ErrorDetails {
  status?: number;
  statusText?: string;
  detail?: string;
  message?: string;
  error?: string;
  code?: string;
  timestamp?: string;
  path?: string;
}

interface ErrorResponseProps {
  error: string | ErrorDetails;
  code?: number;
}

/**
 * Parses error response content (JSON or text) into structured format
 */
const parseErrorContent = (content: string): ErrorDetails => {
  // Try to parse as JSON
  try {
    const parsed = JSON.parse(content);
    return parsed;
  } catch {
    // If not JSON, treat as plain text error message
    return { detail: content };
  }
};

/**
 * Extracts error message from various formats
 */
const getErrorMessage = (error: ErrorDetails): string => {
  return error.detail || error.message || error.error || 'Unknown error occurred';
};

/**
 * Gets human-readable error type
 */
const getErrorType = (message: string, code?: number): { type: string; emoji: string } => {
  if (code === 403 || message.includes('not allowed') || message.includes('permission')) {
    return { type: 'Access Denied', emoji: '🔒' };
  }
  if (code === 429 || message.includes('rate limit')) {
    return { type: 'Rate Limited', emoji: '⏱️' };
  }
  if (code === 401 || message.includes('unauthorized') || message.includes('authentication')) {
    return { type: 'Authentication Failed', emoji: '🔐' };
  }
  if (code === 404 || message.includes('not found')) {
    return { type: 'Not Found', emoji: '🔍' };
  }
  if (code && code >= 500) {
    return { type: 'Server Error', emoji: '⚠️' };
  }
  return { type: 'Error', emoji: '❌' };
};

/**
 * Suggests action based on error message
 */
const getSuggestedAction = (message: string): string | null => {
  if (message.includes('not allowed') || message.includes('Model')) {
    return 'Try selecting a different model or provider';
  }
  if (message.includes('rate limit')) {
    return 'Wait a moment and try again';
  }
  if (message.includes('authentication') || message.includes('API key')) {
    return 'Check your API key configuration';
  }
  if (message.includes('budget')) {
    return 'Check your account budget or upgrade your plan';
  }
  return null;
};

/**
 * Renders a formatted error response
 */
export const ErrorResponse: React.FC<ErrorResponseProps> = ({ error, code }) => {
  const errorData = typeof error === 'string' ? parseErrorContent(error) : error;
  const message = getErrorMessage(errorData);
  const { type, emoji } = getErrorType(message, code);
  const suggestion = getSuggestedAction(message);

  return (
    <div className={styles.errorContainer}>
      <div className={styles.errorHeader}>
        <div className={styles.errorIcon}>{emoji}</div>
        <div className={styles.errorTitle}>{type}</div>
      </div>

      <div className={styles.errorBody}>
        <div className={styles.errorMessage}>
          {message}
        </div>

        {suggestion && (
          <div className={styles.errorSuggestion}>
            <div className={styles.suggestionLabel}>💡 Suggestion:</div>
            <div className={styles.suggestionText}>{suggestion}</div>
          </div>
        )}

        {errorData.code && (
          <div className={styles.errorMeta}>
            <span className={styles.metaLabel}>Code:</span>
            <code className={styles.metaValue}>{errorData.code}</code>
          </div>
        )}

        {code && (
          <div className={styles.errorMeta}>
            <span className={styles.metaLabel}>HTTP Status:</span>
            <code className={styles.metaValue}>{code}</code>
          </div>
        )}
      </div>

      <div className={styles.errorFooter}>
        <div className={styles.errorTip}>
          If the problem persists, please contact support or check the documentation.
        </div>
      </div>
    </div>
  );
};

export default ErrorResponse;
