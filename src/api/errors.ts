/**
 * Standardized API error types
 */
export enum ApiErrorType {
  UNAUTHORIZED = 'UNAUTHORIZED', // 401
  NETWORK = 'NETWORK', // Network/fetch errors
  SERVER = 'SERVER', // 5xx errors
  CLIENT = 'CLIENT', // 4xx errors (except 401)
  UNKNOWN = 'UNKNOWN', // Other errors
}

export interface ApiError {
  type: ApiErrorType;
  message: string;
  statusCode?: number;
  originalError?: Error;
  /** Field-level validation errors from a 422 response (key = field name, value = messages). */
  fields?: Record<string, string[]> | null;
}

/**
 * Check if error is a network error (no response from server)
 */
function isNetworkError(error: any): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  if (error?.name === 'NetworkError' || error?.name === 'TypeError') {
    return true;
  }
  // Check for common network error messages
  const networkMessages = [
    'network',
    'fetch',
    'connection',
    'timeout',
    'failed to fetch',
    'network request failed',
  ];
  const errorMessage = String(error?.message || '').toLowerCase();
  return networkMessages.some(msg => errorMessage.includes(msg));
}

/**
 * Normalize an error into a standardized ApiError
 */
export function normalizeApiError(error: any, statusCode?: number): ApiError {
  // Network errors
  if (isNetworkError(error)) {
    return {
      type: ApiErrorType.NETWORK,
      message: "Can't reach server. Please check your connection and try again.",
      originalError: error instanceof Error ? error : new Error(String(error)),
    };
  }

  // HTTP status code errors
  if (statusCode !== undefined) {
    if (statusCode === 401) {
      return {
        type: ApiErrorType.UNAUTHORIZED,
        message: 'Your session has expired. Please log in again.',
        statusCode: 401,
        originalError: error instanceof Error ? error : new Error(String(error)),
      };
    }

    if (statusCode >= 500) {
      return {
        type: ApiErrorType.SERVER,
        message: 'Server error. Please try again later.',
        statusCode,
        originalError: error instanceof Error ? error : new Error(String(error)),
      };
    }

    if (statusCode >= 400) {
      return {
        type: ApiErrorType.CLIENT,
        message: error?.message || `Request failed (${statusCode})`,
        statusCode,
        originalError: error instanceof Error ? error : new Error(String(error)),
        fields: error?.fields ?? null,
      };
    }
  }

  // Try to extract message from error
  let message = 'An unexpected error occurred';
  if (error?.message) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  return {
    type: ApiErrorType.UNKNOWN,
    message,
    originalError: error instanceof Error ? error : new Error(String(error)),
  };
}

/**
 * Check if error is a 401 Unauthorized error
 */
export function isUnauthorizedError(error: ApiError): boolean {
  return error.type === ApiErrorType.UNAUTHORIZED;
}

/**
 * Check if error is a network error
 */
export function isNetworkErrorType(error: ApiError): boolean {
  return error.type === ApiErrorType.NETWORK;
}

