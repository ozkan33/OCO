import { z } from 'zod';
import { ALL_ROLES, Role } from './rbac';

// Roles that an admin may assign to a new user via the admin UI. ADMIN is
// excluded on purpose — admins are provisioned out-of-band, not from the UI.
const ASSIGNABLE_ROLES = ALL_ROLES.filter(r => r !== Role.ADMIN) as [Role, ...Role[]];

export const createCommentSchema = z.object({
  scorecard_id: z.string().min(1, 'Scorecard ID is required'),
  user_id: z.union([z.string(), z.number()]).transform(String), // row_id (misnamed in client)
  text: z.string().min(1, 'Text is required').max(5000),
  parent_row_id: z.string().optional().nullable(), // For subgrid comments: the parent row ID
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

// Brand user management
export const createBrandUserSchema = z.object({
  email: z.string().email('Valid email required'),
  contactName: z.string().min(1, 'Contact name required').max(255),
  // brandName is required for BRAND users (they belong to a brand) but optional
  // for internal roles (KEY_ACCOUNT_MANAGER, FIELD_SALES_REP). Enforced below.
  brandName: z.string().max(255).optional().default(''),
  tempPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(ASSIGNABLE_ROLES).default(Role.BRAND),
  scorecardAssignments: z.array(z.object({
    scorecardId: z.string().min(1),
    productColumns: z.array(z.string()),
  })).optional().default([]),
}).refine(
  (data) => data.role !== Role.BRAND || (data.brandName && data.brandName.trim().length > 0),
  { message: 'Brand name is required for brand users', path: ['brandName'] },
);

export const updateBrandUserSchema = z.object({
  contactName: z.string().min(1).max(255).optional(),
  brandName: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
  scorecardAssignments: z.array(z.object({
    scorecardId: z.string().min(1),
    productColumns: z.array(z.string()),
  })).optional(),
});

export const changePasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// Portal comment (brand users adding notes)
export const portalCommentSchema = z.object({
  scorecard_id: z.string().uuid('Valid scorecard ID required'),
  row_id: z.union([z.string(), z.number()]).transform(String),
  text: z.string().min(1, 'Comment text is required').max(5000),
  parent_row_id: z.string().optional().nullable(), // For subgrid store-level comments
  store_name: z.string().optional().nullable(), // Store name for subgrid matching
});

// Notification mark-as-read
export const markNotificationsReadSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  markAllRead: z.boolean().optional(),
  scorecardId: z.string().uuid().optional(),
  rowId: z.union([z.string(), z.number()]).transform(String).optional(),
}).refine(
  (data) => data.ids?.length || data.markAllRead || (data.scorecardId && data.rowId),
  { message: 'Provide ids, markAllRead, or { scorecardId, rowId }' },
);

// Contact form submission (public landing page)
export const contactSubmissionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Valid email required'),
  product: z.string().min(1, 'Product / Brand is required').max(255),
  category: z.string().min(1, 'Category is required').max(255),
  distribution: z.string().max(255).optional().default(''),
  challenge: z.string().max(255).optional().default(''),
  heardAbout: z.string().max(255).optional().default(''),
  message: z.string().max(5000).optional().default(''),
});
