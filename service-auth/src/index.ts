/**
 * `@arena/service-auth` — shared authentication primitives for Arena services.
 *
 * - {@link signToken} / {@link verifyToken} / {@link verifyTokenClaims}:
 *   stateless HS256 session tokens keyed on the shared `SESSION_SECRET`, carrying
 *   an unforgeable `admin` claim.
 * - {@link isAdminEmail}: is an email on the `ADMIN_EMAILS` allowlist (betting
 *   stamps the admin claim from it at login).
 * - {@link JwtAuthGuard} + {@link Public}: a globally-registrable session guard
 *   with a `@Public()` escape hatch; sets `request.isAdmin`.
 * - {@link AdminGuard}: identity-based admin gate (no shared keys) reading that
 *   claim.
 * - {@link ZodValidationPipe}: parse-don't-trust request validation.
 */
export { signToken, verifyToken, verifyTokenClaims, isAdminEmail, type TokenClaims } from './token';
export { ZodValidationPipe } from './zod-validation.pipe';
export { JwtAuthGuard, Public, IS_PUBLIC_KEY, type AuthenticatedRequest } from './jwt-auth.guard';
export { AdminGuard } from './admin.guard';
