// An expected, deliberate error (e.g. slot taken, booking not found).
// The error handler sends its status/code/message to the client as-is;
// any other thrown value is treated as a bug and becomes a generic 500.
export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}





