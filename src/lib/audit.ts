import type { Request } from 'express';

// One JSON line per security-relevant event, easy to grep or ship to a log tool.
// Never pass passwords, tokens or OTP codes in `details`.
export function audit(req: Request, event: string, details: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({
      audit: event,
      at: new Date().toISOString(),
      requestId: req.id,
      ip: req.ip,
      ...details,
    }),
  );
}
