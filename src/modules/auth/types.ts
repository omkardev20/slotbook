export type SignupRole = 'customer' | 'consultant';

export type PublicRole =
  { role: 'customer' } | { role: 'consultant'; isApproved: boolean } | { role: 'admin' };

export type RoleName = PublicRole['role'];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isValid: boolean;
  roles: PublicRole[];
}

// What a request knows about its caller, straight from the access token with no
// database read. Roles can be up to ACCESS_TOKEN_TTL_MINUTES out of date.
export interface AuthContext {
  id: string;
  roles: PublicRole[];
}
