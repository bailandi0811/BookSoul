import { PublicUser } from '../users/users.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
}

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
}
