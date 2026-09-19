export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  CAROUSEL = 'CAROUSEL',
  REEL = 'REEL',
  STORY = 'STORY'
}

export enum PostStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED'
}

export enum DemographicType {
  AGE = 'AGE',
  GENDER = 'GENDER',
  LOCATION = 'LOCATION'
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface InstagramAccount {
  id: string;
  username: string;
  profilePicUrl: string;
  followersCount: number;
  status: 'active' | 'disconnected';
  lastSyncedAt: string;
}

export interface ScheduledPost {
  id: string;
  accountId: string;
  mediaUrl: string[];
  caption: string;
  scheduledFor: string;
  status: PostStatus;
  type: MediaType;
}

// Additional types would go here...
