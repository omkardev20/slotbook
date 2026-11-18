import type { Row } from '@libsql/client';
import { db } from '../../db/client.ts';

// The shape the API returns. The database uses snake_case; the API uses camelCase.
export interface Service {
  id: string;
  consultantId: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
  bufferMinutes: number;
  isActive: boolean;
}

// libSQL may return INTEGER as number or bigint. Both become a JS number here.
function asNumber(value: Row[string] | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  throw new Error('Expected a number from the database');
}

function mapService(row: Row): Service {
  return {
    id: String(row.id),
    consultantId: String(row.consultant_id),
    name: String(row.name),
    durationMinutes: asNumber(row.duration_minutes),
    priceMinor: asNumber(row.price_minor),
    bufferMinutes: asNumber(row.buffer_minutes),
    isActive: asNumber(row.is_active) === 1,
  };
}

// Only bookable services. Archived rows (is_active = 0) stay in the table
// but are hidden here.
export async function listActiveServices(consultantId: string): Promise<Service[]> {
  const result = await db.execute({
    sql: `
      SELECT id, consultant_id, name, duration_minutes, price_minor,
             buffer_minutes, is_active
      FROM services
      WHERE consultant_id = ? AND is_active = 1
        AND EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_id = services.consultant_id
            AND role = 'consultant'
            AND is_approved = 1
        )
      ORDER BY name
    `,
    args: [consultantId],
  });

  return result.rows.map(mapService);
}
