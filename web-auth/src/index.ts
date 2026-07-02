export { AuthProvider, useAuth, useApi } from './AuthProvider';
export type { AuthContextValue, AuthProviderProps, Session } from './AuthProvider';
export { LoginPage } from './LoginPage';
export { RequireAuth } from './RequireAuth';
export type { RequireAuthProps } from './RequireAuth';
export { isTokenValid, jwtExp } from './jwt';

// Re-exported for convenience so apps can type wallet UI without a second import.
export type { Account, AuthResponse } from '@arena/contracts';
