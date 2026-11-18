import { z } from 'zod';
import { idSchema } from '../../lib/validators.ts';

// The id in the URL is untrusted text until this accepts it.
export const consultantIdSchema = z.object({
  consultantId: idSchema,
});
