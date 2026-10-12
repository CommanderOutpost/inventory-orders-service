import { api } from './client';
import type { AuthResult } from '../types';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResult>('/auth/login', { email, password }).then((r) => r.data),

  register: (name: string, email: string, password: string) =>
    api.post<AuthResult>('/auth/register', { name, email, password }).then((r) => r.data),
};
