import { clearToken } from '../../utils/token';
import { clearAuth } from '../../utils/auth';
import { normalizeApiError, isUnauthorizedError, type ApiError } from './errors';

/**
 * Global error handler for API errors
 * Handles 401 by clearing auth and routing to login
 */
export interface ErrorHandlerCallbacks {
  onUnauthorized?: () => void;
}

let errorHandlerCallbacks: ErrorHandlerCallbacks = {};

/**
 * Set error handler callbacks (e.g., from App.tsx for routing)
 */
export function setErrorHandlerCallbacks(callbacks: ErrorHandlerCallbacks): void {
  errorHandlerCallbacks = callbacks;
}

/**
 * Handle an API error
 * - 401: Clears token and auth, calls onUnauthorized callback
 * - Other errors: Returns normalized error
 */
export async function handleApiError(error: any, statusCode?: number): Promise<ApiError> {
  const normalizedError = normalizeApiError(error, statusCode);

  // Handle 401 Unauthorized
  if (isUnauthorizedError(normalizedError)) {
    // Clear authentication
    await clearToken();
    await clearAuth();

    // Notify app to route to login
    if (errorHandlerCallbacks.onUnauthorized) {
      errorHandlerCallbacks.onUnauthorized();
    }
  }

  return normalizedError;
}
