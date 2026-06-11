import type { AuthRepository } from './AuthRepository';
import type { AuthMeDto } from '../contracts/dto';
import type { Role } from '../contracts/roles';
import api from '../api/client';
import { getAuthEmail, getAuthRole, setAuthEmail, setAuthRole, clearAuth } from '../../utils/auth';
import { setToken, clearToken } from '../../utils/token';

/**
 * Marketplace-engine auth shape:
 *   register/login return { user: {id, name, email, ...}, roles: ['parent'|...], token }
 *   me returns the user model directly (no `role` field — caller already has it)
 *
 * Engine uses Spatie's role system (a user can technically have multiple roles).
 * For Hobgoblin our policy is one role per user, so we pick the first one.
 */
function pickValidRole(roleCandidates: any): Role | null {
  const allowed: Role[] = ['parent', 'restaurant', 'driver', 'kid', 'admin'] as any;
  if (Array.isArray(roleCandidates)) {
    for (const r of roleCandidates) {
      if (allowed.includes(r as Role)) return r as Role;
    }
    return null;
  }
  if (typeof roleCandidates === 'string' && allowed.includes(roleCandidates as Role)) {
    return roleCandidates as Role;
  }
  return null;
}

export class ApiAuthRepository implements AuthRepository {
  async getRole(): Promise<Role | null> {
    return await getAuthRole();
  }

  async setRole(role: Role | null): Promise<void> {
    if (!role) {
      await clearAuth();
      return;
    }
    await setAuthRole(role);
  }

  async getEmail(): Promise<string | null> {
    return await getAuthEmail();
  }

  async setEmail(email: string | null): Promise<void> {
    await setAuthEmail(email);
  }

  async register(data: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    role: 'parent' | 'restaurant' | 'driver' | 'kid';
    restaurant_name?: string;
    restaurant_cuisine?: string;
    restaurant_description?: string;
  }): Promise<{ user: any; token?: string; message?: string }> {
    const result = await api.register(data);
    if (result?.token) {
      await setToken(result.token);
      await setAuthEmail(result.user?.email || data.email);
      const validRole = pickValidRole(result.roles) || pickValidRole(data.role);
      if (validRole) await setAuthRole(validRole);
    } else {
      await setAuthEmail(result?.user?.email || data.email);
    }
    return result;
  }

  async login(credentials: { email: string; password: string }): Promise<{ user: any; token: string }> {
    const result = await api.login(credentials);
    if (result?.token) {
      await setToken(result.token);
      await setAuthEmail(result.user?.email || credentials.email);
      const validRole = pickValidRole(result.roles);
      if (validRole) await setAuthRole(validRole);
    }
    return result;
  }

  async me(): Promise<AuthMeDto | null> {
    try {
      const user = await api.me();
      if (!user) return null;

      // Trust the engine's /me roles array first — MeController returns
      // $user->getRoleNames(), which is the authoritative source. Fall back
      // to the locally cached role only if /me omits it (older endpoints,
      // or transient role-loading edge cases). This ordering also stops a
      // stale role from a different account (e.g. a parent session left
      // in localStorage) from shadowing the real role of the current token.
      const apiRole   = pickValidRole(user.roles);
      const localRole = await getAuthRole();
      const validRole = apiRole || localRole;

      if (!validRole) {
        console.warn('No valid role for user', user?.id);
        return null;
      }

      // Keep local storage in sync with what the API just said, so callers
      // that read from getAuthRole() directly don't see a stale value.
      if (apiRole && apiRole !== localRole) {
        await setAuthRole(apiRole);
      }

      return {
        role: validRole,
        email: user.email,
      };
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await api.logout();
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      await clearToken();
      await clearAuth();
    }
  }
}
