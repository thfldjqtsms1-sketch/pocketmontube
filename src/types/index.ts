export interface Channel {
  id: string;
  name: string;
  thumbnail?: string;
  handle?: string;
}

export interface Video {
  id: string;              // 영상 ID (예: dQw4w9WgXcQ)
  title: string;
  channelId: string;
  channelName: string;
  thumbnail: string;
  duration: string;
  viewCount: number;
  uploadedAt: number;      // timestamp
  url: string;
  watched: boolean;
  groupId: string;         // 어느 그룹에 속하는지
  isShorts?: boolean;      // Shorts 여부
  viralScore?: number;     // 바이럴 지수 (시간당 조회수)
  hasExactDate?: boolean;  // 정확한 발행일이 파싱되었는지 (HTTP 요청 스킵용)
}

export interface Group {
  id: string;
  name: string;
  channels: Channel[];
  videos: Video[];         // 이 그룹의 영상들
  color?: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
  lastVideoUpdate?: number; // 마지막 영상 업데이트 시각
}

export interface StorageData {
  groups: Group[];
  settings: Settings;
}

export interface Settings {
  defaultView: 'all' | 'grouped';
  showInSidebar: boolean;
  theme: 'auto' | 'light' | 'dark';
  sidebarPosition: 'top' | 'bottom';
  maxVideosPerChannel: number;  // 최대 표시 영상 수 (100, 300, 500, 800)
  viewCountSource: ViewCountSource;  // 조회수 소스
  dataSource: DataSource;  // 데이터 수집 방식
  youtubeApiKey?: string;  // YouTube API 키 (API 방식 선택 시 필요)
  githubToken?: string;    // GitHub Personal Access Token
  githubRepo?: string;     // GitHub 리포지토리 (예: username/repo)
  autoSyncChannels?: boolean;  // 채널 추가/삭제 시 자동으로 GitHub에 푸시
}

// 조회수 소스
export type ViewCountSource = 'returnyoutubedislike' | 'directfetch';

// 데이터 수집 방식
export type DataSource = 'html' | 'youtube_api';

export const DEFAULT_SETTINGS: Settings = {
  defaultView: 'all',
  showInSidebar: true,
  theme: 'auto',
  sidebarPosition: 'top',
  maxVideosPerChannel: 300,
  viewCountSource: 'returnyoutubedislike',
  dataSource: 'html',  // 기본값: HTML 스크래핑
  youtubeApiKey: '',
  githubToken: '',
  githubRepo: '',
  autoSyncChannels: false
};

// API 사용량 추적
export interface ApiUsage {
  date: string;        // YYYY-MM-DD
  unitsUsed: number;   // 오늘 사용한 유닛
  dailyLimit: number;  // 10000
}

export const STORAGE_KEYS = {
  GROUPS: 'groups',
  SETTINGS: 'settings',
  WATCHED_VIDEOS: 'watchedVideos',
  SAVED_VIDEOS: 'savedVideos',
  API_USAGE: 'apiUsage'  // API 사용량 추적
} as const;

export type SortOption = 'date' | 'oldest' | 'views' | 'viral';
export type FilterOption = 'all' | 'unwatched' | 'saved' | 'shorts' | 'longform';
export type VideoLimitOption = 100 | 300 | 500 | 800;

