import { z } from 'zod';
import { BULK_MAX_ITEMS } from '@bongah/shared-types';
import { queryInt, paginationShape } from './property.schema';

/**
 * Bulk requests carry rows as plain data and are validated row by row by the API, so one bad row
 * never costs the other rows (each row gets its own result).
 */
const rows = z.array(z.unknown()).min(1, 'Send at least one row').max(BULK_MAX_ITEMS, `At most ${BULK_MAX_ITEMS} rows per request`);

/** POST /agencies/me/properties/bulk: every row is a normal POST /properties body. */
export const bulkCreatePropertiesSchema = z.strictObject({ items: rows });
export type BulkCreatePropertiesInput = z.output<typeof bulkCreatePropertiesSchema>;

/** PATCH /agencies/me/properties/bulk: every row is `{ id, ...fields of a normal PATCH /properties/:id }`. */
export const bulkUpdatePropertiesSchema = z.strictObject({ items: rows });
export type BulkUpdatePropertiesInput = z.output<typeof bulkUpdatePropertiesSchema>;

/** GET /property-images/mine */
export const propertyImagesQuerySchema = z.strictObject(paginationShape);
export type PropertyImagesQuery = z.output<typeof propertyImagesQuerySchema>;

export { queryInt };

/** The `id` of one row of a bulk edit. */
export const bulkRowIdSchema = z.uuid();
