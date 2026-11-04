import { z } from 'zod';

// The id in the URL is untrusted text until this accepts it.
export const consultantIdSchema = z.object({
  consultantId: z.uuid(),
});
