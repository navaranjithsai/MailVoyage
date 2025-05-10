export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: string;
  public readonly isOperational: boolean;
  public readonly meta?: Record<string, any>; // For additional error details (e.g., validation errors)

  constructor(message: string, statusCode: number, isOperational: boolean = true, meta?: Record<string, any>) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational; // Distinguishes operational errors from programming errors
    this.meta = meta;

    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name;

    // Capture the stack trace, excluding the constructor call from it.
    Error.captureStackTrace(this, this.constructor);
  }
}
