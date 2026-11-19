import { z } from 'zod';
import { idSchema } from '../../lib/validators.ts';

export const userIdParamsSchema = z.object({
  userId: idSchema,
});
