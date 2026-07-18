import { z } from 'zod';

export const testServiceUrlsSchema = z.object({
  apiUrl: z.url(),
  webUrl: z.url(),
});
