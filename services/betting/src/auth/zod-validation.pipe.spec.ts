import { BadRequestException } from '@nestjs/common';
import { RequestOtpRequestSchema } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(RequestOtpRequestSchema);

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
