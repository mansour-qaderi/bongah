import type { ListPropertiesQuery, PaginationQuery } from '@bongah/validation';

export { listPropertiesQuerySchema, paginationQuerySchema } from '@bongah/validation';

/** GET /properties query (already validated; numbers are real numbers, defaults applied). */
export type ListPropertiesDto = ListPropertiesQuery;
/** GET /properties/mine query. */
export type PaginationDto = PaginationQuery;
