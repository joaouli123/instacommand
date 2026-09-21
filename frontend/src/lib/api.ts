import { BACKEND_ORIGIN } from './config';

const BASE_URL = `${BACKEND_ORIGIN}/api`;

export async function fetchApi(path: string, options: RequestInit = {}) {
  // Keep the browser token fallback for older sessions while cookies remain the default.
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
    // API responses are user/workspace-specific and must not be replaced by
    // a browser 304 that fetch() exposes as a failed response.
    cache: options.cache ?? 'no-store',
    credentials: 'include',
    headers,
  });

  // Some reverse proxies can still return 304 even with no-store. Retry once
  // without validators so callers always receive the JSON representation.
  if (response.status === 304) {
    return fetchApi(path, { ...options, cache: 'no-store' });
  }

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
  getMe: () => fetchApi('/auth/me'),
  getAccounts: () => fetchApi('/accounts'),
  syncAccount: (id: string) => fetchApi(`/accounts/${id}/sync`, { method: 'POST' }),
  getPendingAccounts: () => fetchApi('/accounts/pending'),
  selectAccounts: (accountIds: string[]) => fetchApi('/accounts/select', { method: 'POST', body: JSON.stringify({ accountIds }) }),
  getThreadsAccounts: () => fetchApi('/accounts/threads'),
  disconnectThreadsAccount: (id: string) => fetchApi(`/accounts/threads/${id}`, { method: 'DELETE' }),
  uploadMedia: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return fetchApi('/posts/upload', { method: 'POST', body: formData });
  },
  createPost: (data: Record<string, unknown>) => fetchApi('/posts', { method: 'POST', body: JSON.stringify(data) }),
  publishPost: (id: string) => fetchApi(`/posts/${id}/publish`, { method: 'POST' }),
  getPosts: (params = '') => fetchApi(`/posts${params ? `?${params}` : ''}`),
  getPost: (id: string) => fetchApi(`/posts/${encodeURIComponent(id)}`),
  saveDailyDrafts: (data: Record<string, unknown>) => fetchApi('/ai/daily-drafts', { method: 'POST', body: JSON.stringify(data) }),
  updatePost: (id: string, data: Record<string, unknown>) => fetchApi(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePost: (id: string) => fetchApi(`/posts/${id}`, { method: 'DELETE' }),
  getDashboard: (accountId: string, days = 30) => fetchApi(`/analytics/${accountId}/dashboard?days=${days}`),
  getGrowth: (accountId: string, days: number) => fetchApi(`/analytics/${accountId}/growth?days=${days}`),
  getEngagement: (accountId: string, days: number) => fetchApi(`/analytics/${accountId}/engagement?days=${days}`),
  getAnalyticsPosts: (accountId: string, page = 1, limit = 20, days = 30) => fetchApi(`/analytics/${accountId}/posts?page=${page}&limit=${limit}&days=${days}`),
  getBestTimes: (accountId: string) => fetchApi(`/analytics/${accountId}/best-times`),
  getContentTypes: (accountId: string) => fetchApi(`/analytics/${accountId}/content-types`),
  getRecommendations: (accountId: string) => fetchApi(`/analytics/${accountId}/recommendations`),
  getCompetitors: (accountId: string) => fetchApi(`/competitors/${accountId}`),
  addCompetitor: (accountId: string, igUsername: string) => fetchApi(`/competitors/${accountId}`, { method: 'POST', body: JSON.stringify({ igUsername }) }),
  deleteCompetitor: (id: string) => fetchApi(`/competitors/${id}`, { method: 'DELETE' }),
  refreshCompetitor: (id: string) => fetchApi(`/competitors/${id}/refresh`, { method: 'POST' }),
  searchHashtag: (accountId: string, query: string) => fetchApi(`/trends/${accountId}/hashtags?q=${encodeURIComponent(query)}`),
  getSavedHashtags: (accountId: string) => fetchApi(`/trends/${accountId}/saved`),
  trackHashtag: (accountId: string, data: Record<string, unknown>) => fetchApi(`/trends/${accountId}/hashtags/track`, { method: 'POST', body: JSON.stringify(data) }),
  untrackHashtag: (accountId: string, id: string) => fetchApi(`/trends/${accountId}/hashtags/${id}`, { method: 'DELETE' }),
  generateAi: (data: Record<string, unknown>) => fetchApi('/ai/generate', { method: 'POST', body: JSON.stringify(data) }),
  getNotifications: () => fetchApi('/notifications'),
  getAiSettings: () => fetchApi('/settings/ai'),
  saveAiSettings: (data: Record<string, unknown>) => fetchApi('/settings/ai', { method: 'PUT', body: JSON.stringify(data) }),
  markNotificationRead: (id: string) => fetchApi(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => fetchApi('/notifications/read-all', { method: 'POST' }),
  getComments: (accountId: string) => fetchApi(`/community/comments?accountId=${encodeURIComponent(accountId)}`),
  replyComment: (data: { accountId: string; mediaId: string; commentId: string; message: string }) => fetchApi(`/community/comments/${encodeURIComponent(data.commentId)}/reply`, { method: 'POST', body: JSON.stringify(data) }),
  deleteComment: (data: { accountId: string; mediaId: string; commentId: string }) => fetchApi(`/community/comments/${encodeURIComponent(data.commentId)}?accountId=${encodeURIComponent(data.accountId)}&mediaId=${encodeURIComponent(data.mediaId)}`, { method: 'DELETE' }),
};
