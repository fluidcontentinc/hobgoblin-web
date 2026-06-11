export const Roles = ['parent', 'restaurant', 'driver', 'kid', 'admin'] as const;
export type Role = (typeof Roles)[number];

export const AuthRoles = Roles;
export type AuthRole = Role;


