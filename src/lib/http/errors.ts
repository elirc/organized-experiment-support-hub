export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(message, 400, "BAD_REQUEST", details);

export const unauthorized = (message = "Authentication is required.") =>
  new AppError(message, 401, "UNAUTHORIZED");

export const forbidden = (message = "You do not have permission to perform this action.") =>
  new AppError(message, 403, "FORBIDDEN");

export const notFound = (message = "The requested resource was not found.") =>
  new AppError(message, 404, "NOT_FOUND");

export const conflict = (message: string, details?: unknown) =>
  new AppError(message, 409, "CONFLICT", details);
