/**
 * `@arena/service-auth` — shared authentication primitives for Arena services.
 *
 * - {@link signToken} / {@link verifyToken}: stateless HS256 session tokens
 *   keyed on the shared `SESSION_SECRET`.
 * - {@link JwtAuthGuard} + {@link Public}: a globally-registrable session guard
 *   with a `@Public()` escape hatch.
 * - {@link ZodValidationPipe}: parse-don't-trust request validation.
 */
export { signToken, verifyToken } from './token';
export { ZodValidationPipe } from './zod-validation.pipe';
export { JwtAuthGuard, Public, IS_PUBLIC_KEY, type AuthenticatedRequest } from './jwt-auth.guard';
