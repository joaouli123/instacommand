import { BACKEND_ORIGIN } from './config';

const BASE_URL = `${BACKEND_ORIGIN}/api`;

export async function fetchApi(path: string, options: RequestInit = {}) {
  // Mock token retrieval
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('instacommand_token') || localStorage.getItem('token')
    : null;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  getAccounts: () => fetchApi('/accounts'),
  getDashboard: (accountId: string) => fetchApi(`/dashboard/${accountId}`),
  getGrowth: (accountId: string, days: number) => fetchApi(`/analytics/${accountId}/growth?days=${days}`),
};
