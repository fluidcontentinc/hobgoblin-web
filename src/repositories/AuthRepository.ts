import type { AuthMeDto } from '../contracts/dto';
import type { Role } from '../contracts/roles';

export interface AuthRepository {
  getRole(): Promise<Role | null>;
  setRole(role: Role | null): Promise<void>;

  getEmail(): Promise<string | null>;
  setEmail(email: string | null): Promise<void>;

  register(data: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    role: 'parent' | 'restaurant' | 'driver' | 'kid';
    restaurant_name?: string;
    restaurant_cuisine?: string;
    restaurant_description?: string;
  }): Promise<{ user: any; token?: string; message?: string }>;

  login(credentials: {
    email: string;
    password: string;
  }): Promise<{ user: any; token: string }>;

  me(): Promise<AuthMeDto | null>;
  logout(): Promise<void>;
}


