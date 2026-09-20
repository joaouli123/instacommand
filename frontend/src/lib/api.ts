import { BACKEND_ORIGIN } from './config';

const BASE_URL = `${BACKEND_ORIGIN}/api`;

export async function fetchApi(path: string, options: RequestInit = {}) {
  // Mock token retrieval
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('instacommand_token') || localStorage.getItem('token')
    : null;
  
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (response.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('instacommand_token');
    localStorage.removeItem('token');
    localStorage.removeItem('instacommand_user');

    if (window.location.pathname !== '/login') {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || payload?.message || `API Error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  getAccounts: () => fetchApi('/accounts'),
  getPendingAccounts: () => fetchApi('/accounts/pending'),
  selectAccounts: (accountIds: string[]) => fetchApi('/accounts/select', { method: 'POST', body: JSON.stringify({ accountIds }) }),
  getThreadsAccounts: () => fetchApi('/accounts/threads'),
  uploadMedia: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return fetchApi('/posts/upload', { method: 'POST', body: formData });
  },
  createPost: (data: Record<string, unknown>) => fetchApi('/posts', { method: 'POST', body: JSON.stringify(data) }),
  publishPost: (id: string) => fetchApi(`/posts/${id}/publish`, { method: 'POST' }),
  getPosts: (params = '') => fetchApi(`/posts${params ? `?${params}` : ''}`),
  getDashboard: (accountId: string) => fetchApi(`/analytics/${accountId}/dashboard`),
  getGrowth: (accountId: string, days: number) => fetchApi(`/analytics/${accountId}/growth?days=${days}`),
  getEngagement: (accountId: string, days: number) => fetchApi(`/analytics/${accountId}/engagement?days=${days}`),
  getAnalyticsPosts: (accountId: string, page = 1, limit = 20) => fetchApi(`/analytics/${accountId}/posts?page=${page}&limit=${limit}`),
  generateAi: (data: Record<string, unknown>) => fetchApi('/ai/generate', { method: 'POST', body: JSON.stringify(data) }),
};
