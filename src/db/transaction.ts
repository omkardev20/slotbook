import type { Transaction } from '@libsql/client';
import { db } from './client.ts';

// Runs `work` inside one write transaction: commit if it finishes, roll back
// if it throws. Callers never write try/catch/rollback themselves.
export async function withTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = await db.transaction('write');
  try {
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
