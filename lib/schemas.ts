import { z } from 'zod';

export const createCommentSchema = z.object({
  scorecard_id: z.string().min(1, 'Scorecard ID is required'),
  user_id: z.union([z.string(), z.number()]).transform(String), // row_id (misnamed in client)
  text: z.string().min(1, 'Text is required').max(5000),
  scorecard_data: z
    .object({
      name: z.string().optional(),
      columns: z.array(z.any()).optional(),
      rows: z.array(z.any()).optional(),
    })
    .optional()
    .nullable(),
});

export const updateCommentSchema = z.object({
  text: z.string().min(1, 'Text is required').max(5000),
});

export const createScorecardSchema = z.object({
  title: z.string().max(255).optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  data: z.record(z.any()).optional(),
});

export const updateScorecardSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(255).optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  data: z.record(z.any()).optional(),
  is_draft: z.boolean().optional(),
});
