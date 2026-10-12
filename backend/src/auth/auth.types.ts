import { UserRole } from '../users/user-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
}

/** Shape attached to `request.user` after JWT authentication. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}
