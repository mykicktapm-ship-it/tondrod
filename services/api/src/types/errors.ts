/**
 * Error codes and helper functions.
 */

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_INIT_DATA: 'INVALID_INIT_DATA',
  WALLET_ALREADY_LINKED: 'WALLET_ALREADY_LINKED',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export function toHttpStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCodes.UNAUTHORIZED:
      return 401;
    case ErrorCodes.NOT_FOUND:
      return 404;
    case ErrorCodes.WALLET_ALREADY_LINKED:
      return 409;
    default:
      return 400;
  }
}