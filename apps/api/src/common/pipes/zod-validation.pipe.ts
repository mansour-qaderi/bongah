import { BadRequestException, PipeTransform } from '@nestjs/common';

/** The slice of a Zod schema this pipe needs, so the API doesn't depend on a specific Zod copy. */
interface Parser<T> {
  safeParse(data: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } };
}

/** Validates (and transforms) a request value with a Zod schema, e.g. from @bongah/validation. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: Parser<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
