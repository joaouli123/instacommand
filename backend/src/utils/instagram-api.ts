import axios, { AxiosError } from 'axios';
import { InstagramApiError } from './errors';

const GRAPH_API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const igApi = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

const handleApiError = (error: unknown): never => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error?.message || error.message;
    throw new InstagramApiError(message, error.response?.status);
  }
  throw new InstagramApiError('Unknown error occurred');
};

export const graphGet = async (path: string, token: string, params: Record<string, any> = {}) => {
  try {
    const response = await igApi.get(path, {
      params: { ...params, access_token: token },
    });
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
};

export const graphPost = async (path: string, token: string, data: Record<string, any> = {}) => {
  try {
    const response = await igApi.post(path, null, {
      params: { ...data, access_token: token },
    });
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
};

export const graphDelete = async (path: string, token: string) => {
  try {
    const response = await igApi.delete(path, {
      params: { access_token: token },
    });
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
};
