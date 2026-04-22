import axios from 'axios';
import { Room, Message, User } from '../types';

// Use environment variable in production, relative URL in development
const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'; // Vite proxy in development

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth API
export const authAPI = {
  register: async (username: string, email: string, password: string): Promise<{ message: string; token: string; user: User }> => {
    const { data } = await api.post('/auth/register', { username, email, password });
    return data;
  },

  login: async (username: string, password: string): Promise<{ message: string; token: string; user: User }> => {
    const { data } = await api.post('/auth/login', { username, password });
    return data;
  },
};

// Room API
export const roomAPI = {
  getRooms: async (): Promise<{ rooms: Room[] }> => {
    const { data } = await api.get('/rooms');
    return data;
  },

  getRoom: async (roomId: string): Promise<Room> => {
    const { data } = await api.get(`/rooms/${roomId}`);
    return data;
  },

  createRoom: async (name: string): Promise<{ message: string; room: Room }> => {
    const { data } = await api.post('/rooms', { name });
    return data;
  },

  deleteRoom: async (roomId: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/rooms/${roomId}`);
    return data;
  },
};

// Message API
export const messageAPI = {
  getMessages: async (roomId: string, limit = 100): Promise<{ messages: Message[] }> => {
    const { data } = await api.get(`/messages/${roomId}`, { params: { limit } });
    return data;
  },
};

export const pushAPI = {
  getPublicKey: async (): Promise<{ publicKey: string }> => {
    const { data } = await api.get('/push/public-key');
    return data;
  },

  subscribe: async (payload: { username: string; subscription: PushSubscription }) => {
    const { data } = await api.post('/push/subscribe', payload);
    return data;
  },

  unsubscribe: async (endpoint: string) => {
    const { data } = await api.post('/push/unsubscribe', { endpoint });
    return data;
  },
};

export default api;
