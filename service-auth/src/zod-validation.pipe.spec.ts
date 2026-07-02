import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from './zod-validation.pipe';

// A representative request schema — the pipe is schema-agnostic, so a local one
// keeps this package a self-contained leaf (no dependency on @arena/contracts).
const EmailRequestSchema = z.object({ email: z.string().email() });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(EmailRequestSchema);

  it('returns the parsed value for valid input', () => {
    expect(pipe.transform({ email: 'punter@example.com' })).toEqual({
      email: 'punter@example.com',
    });
  });

  it('throws a 400 BadRequestException for invalid input', () => {
    expect(() => pipe.transform({ email: 'not-an-email' })).toThrow(BadRequestException);
  });

  it('throws for a missing field', () => {
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });
});
