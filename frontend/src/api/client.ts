import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Extracts a human readable message from any backend or network error. */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ message?: string | string[] }>;
    const message = err.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    if (err.code === 'ECONNABORTED') return 'The request timed out';
    if (!err.response) return 'Cannot reach the server. Is it running?';
  }
  return 'Something went wrong';
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const message = extractErrorMessage(error);

    // Only mutations toast globally. GET (query load) errors are rendered
    // inline by each page, so toasting here too would double up feedback.
    const method = (error.config?.method ?? '').toLowerCase();
    if (method !== 'get' && method !== 'head') {
      useUiStore.getState().pushToast('error', message);
    }

    if (error.response?.status === 401 && useAuthStore.getState().token) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
