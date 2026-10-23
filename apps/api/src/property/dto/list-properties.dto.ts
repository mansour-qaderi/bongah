import type { ListPropertiesQuery, MyListingsQuery, PaginationQuery } from '@bongah/validation';

export { listPropertiesQuerySchema, myListingsQuerySchema, paginationQuerySchema } from '@bongah/validation';

/** GET /properties query (already validated; numbers are real numbers, defaults applied). */
export type ListPropertiesDto = ListPropertiesQuery;
/** Plain page and limit (the other paged lists). */
export type PaginationDto = PaginationQuery;
/** GET /properties/mine query: page, limit and the optional filters of an owner's own list. */
export type MyListingsDto = MyListingsQuery;
