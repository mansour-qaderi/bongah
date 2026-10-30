import type { BulkResponse, Property } from '@bongah/shared-types';
import { BULK_MAX_ITEMS } from '@bongah/shared-types';
import type { CreatePropertyInput } from '@bongah/validation';
import { ApiError, api, errorMessage, messageForCode } from '../api';
import { pooled, withBackoff } from '../listing-actions';
import type { DraftErrors, DraftField } from './draft-validation';
import { tNow } from '@/i18n/active';

export interface PublishItem {
  key: string;
  input: CreatePropertyInput;
}

export interface PublishResult {
  key: string;
  ok: boolean;
  /** Why it failed, for the row. */
  message?: string;
  /** Per-field complaints from the API, in the draft's field names. */
  errors?: DraftErrors;
}

const FIELDS: DraftField[] = ['title', 'description', 'type', 'deal_type', 'price', 'monthly_rent', 'currency', 'features', 'deed_type', 'area_sqm', 'bedrooms', 'bathrooms', 'province', 'district', 'neighborhood', 'address', 'images'];

function fieldErrors(list: { field: string; message: string }[] | undefined): DraftErrors | undefined {
  if (!list?.length) return undefined;
  const out: DraftErrors = {};
  for (const e of list) {
    const name = e.field.split('.')[0] as string;
    const field: DraftField = name === 'lat' || name === 'lng' || name === 'boundary' ? 'location' : FIELDS.includes(name as DraftField) ? (name as DraftField) : 'title';
    out[field] ??= tNow('import.publish.invalidValue');
  }
  return out;
}

/**
 * Sends drafts to the API: 50 per request on the agency plan's bulk endpoint, and one by one for an office without
 * a plan (the bulk endpoint needs the plan). Rate limits are waited out; every row gets its own result.
 */
export async function publishDrafts(
  items: readonly PublishItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<PublishResult[]> {
  const results: PublishResult[] = [];
  let done = 0;
  const tick = (n: number) => {
    done += n;
    onProgress?.(done, items.length);
  };
  const fail = (rest: readonly PublishItem[], message: string) => {
    for (const it of rest) results.push({ key: it.key, ok: false, message });
    tick(rest.length);
  };

  let bulk = true;
  for (let i = 0; i < items.length; i += BULK_MAX_ITEMS) {
    const chunk = items.slice(i, i + BULK_MAX_ITEMS);
    if (bulk) {
      try {
        const res = await withBackoff(() =>
          api.post<BulkResponse<Property>>('agencies/me/properties/bulk', { items: chunk.map((c) => c.input) }),
        );
        for (const row of res.results) {
          const item = chunk[row.index]!;
          if (row.ok) results.push({ key: item.key, ok: true });
          else
            results.push({
              key: item.key,
              ok: false,
              message: messageForCode(row.code) ?? (row.errors?.length ? tNow('import.publish.invalidRow') : row.message),
              errors: fieldErrors(row.errors),
            });
        }
        tick(chunk.length);
        continue;
      } catch (error) {
        if (error instanceof ApiError && error.status === 403 && error.code === 'PERKS_REQUIRED') {
          bulk = false;
        } else {
          fail(items.slice(i), errorMessage(error));
          return results;
        }
      }
    }
    await pooled(chunk, 2, async (item) => {
      try {
        await withBackoff(() => api.post<Property>('properties', item.input));
        results.push({ key: item.key, ok: true });
      } catch (error) {
        results.push({
          key: item.key,
          ok: false,
          message: errorMessage(error),
          errors: error instanceof ApiError ? fieldErrors(error.body.errors) : undefined,
        });
      }
      tick(1);
    });
  }
  return results;
}
