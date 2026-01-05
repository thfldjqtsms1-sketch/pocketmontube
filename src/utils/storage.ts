import type { Group, Settings, StorageData, Channel, Video } from '../types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../types';

/**
 * 2025 최신 Chrome Storage API 래퍼
 * - Type-safe
 * - Promise-based
 * - Auto-sync across extension contexts
 */
export class StorageManager {
  /**
   * 모든 그룹 가져오기
   */
  static async getGroups(): Promise<Group[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.GROUPS);
    return result[STORAGE_KEYS.GROUPS] ?? [];
  }

  /**
   * 모든 그룹 저장
   */
  static async setGroups(groups: Group[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
  }

  /**
   * 특정 그룹 가져오기
   */
  static async getGroup(groupId: string): Promise<Group | undefined> {
    const groups = await this.getGroups();
    return groups.find(g => g.id === groupId);
  }

  /**
   * 그룹 추가
   */
  static async addGroup(group: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>): Promise<Group> {
    const groups = await this.getGroups();
    const newGroup: Group = {
      ...group,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    groups.push(newGroup);
    await this.setGroups(groups);
    return newGroup;
  }

  /**
   * 그룹 업데이트
   */
  static async updateGroup(groupId: string, updates: Partial<Omit<Group, 'id' | 'createdAt'>>): Promise<void> {
    const groups = await this.getGroups();
    const index = groups.findIndex(g => g.id === groupId);
    if (index === -1) throw new Error(`Group ${groupId} not found`);

    groups[index] = {
      ...groups[index],
      ...updates,
      updatedAt: Date.now()
    };
    await this.setGroups(groups);
  }

  /**
   * 그룹 삭제
   */
  static async deleteGroup(groupId: string): Promise<void> {
    const groups = await this.getGroups();
    const filtered = groups.filter(g => g.id !== groupId);
    await this.setGroups(filtered);
  }

  /**
   * 그룹에 채널 추가
   */
  static async addChannelToGroup(groupId: string, channel: Channel): Promise<void> {
    const groups = await this.getGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);

    // 중복 체크
    if (!group.channels.some(c => c.id === channel.id)) {
      group.channels.push(channel);
      group.updatedAt = Date.now();
      await this.setGroups(groups);
    }
  }

  /**
   * 그룹에서 채널 제거
   */
  static async removeChannelFromGroup(groupId: string, channelId: string): Promise<void> {
    const groups = await this.getGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);

    group.channels = group.channels.filter(c => c.id !== channelId);
    group.updatedAt = Date.now();
    await this.setGroups(groups);
  }

  /**
   * 그룹의 수집 시간만 업데이트 (영상 변경 없을 때)
   */
  static async updateGroupTimestamp(groupId: string): Promise<void> {
    const groups = await this.getGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    group.lastVideoUpdate = Date.now();
    group.updatedAt = Date.now();
    await this.setGroups(groups);
  }

  /**
   * 설정 가져오기
   */
  static async getSettings(): Promise<Settings> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return result[STORAGE_KEYS.SETTINGS] ?? DEFAULT_SETTINGS;
  }

  /**
   * 설정 업데이트
   */
  static async updateSettings(updates: Partial<Settings>): Promise<void> {
    const current = await this.getSettings();
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: { ...current, ...updates }
    });
  }

  /**
   * 스토리지 변경 감지
   */
  static onChanged(callback: (changes: { groups?: Group[], settings?: Settings }) => void): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      const result: { groups?: Group[], settings?: Settings } = {};
      if (changes[STORAGE_KEYS.GROUPS]) {
        result.groups = changes[STORAGE_KEYS.GROUPS].newValue;
      }
      if (changes[STORAGE_KEYS.SETTINGS]) {
        result.settings = changes[STORAGE_KEYS.SETTINGS].newValue;
      }
      callback(result);
    });
  }

  /**
   * 전체 데이터 내보내기 (백업용)
   */
  static async exportData(): Promise<StorageData> {
    const [groups, settings] = await Promise.all([
      this.getGroups(),
      this.getSettings()
    ]);
    return { groups, settings };
  }

  /**
   * 전체 데이터 가져오기 (복원용)
   */
  static async importData(data: Partial<StorageData>): Promise<void> {
    const updates: Record<string, any> = {};
    if (data.groups) updates[STORAGE_KEYS.GROUPS] = data.groups;
    if (data.settings) updates[STORAGE_KEYS.SETTINGS] = data.settings;
    await chrome.storage.local.set(updates);
  }

  /**
   * 모든 데이터 초기화
   */
  static async clearAll(): Promise<void> {
    await chrome.storage.local.clear();
  }

  // ==================== 영상 관리 메서드 ====================

  /**
   * 그룹에 영상 추가 (중복 제거 + 오래된 영상 정리)
   */
  static async addVideosToGroup(groupId: string, newVideos: Video[]): Promise<void> {
    const groups = await this.getGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);

    // videos 배열 초기화 (기존 그룹에 없을 수 있음)
    if (!group.videos) {
      group.videos = [];
    }

    // 중복 제거 (videoId 기준)
    const existingIds = new Set(group.videos.map(v => v.id));
    const uniqueNewVideos = newVideos.filter(v => !existingIds.has(v.id));

    console.log(`[Storage] Adding ${uniqueNewVideos.length} new videos (${newVideos.length - uniqueNewVideos.length} duplicates skipped)`);

    // 새 영상만 추가
    group.videos = [...group.videos, ...uniqueNewVideos];

    // 최신순 정렬 후 설정한 개수만큼만 유지 (오래된 영상 자동 삭제)
    const settings = await this.getSettings();
    const limit = settings.maxVideosPerChannel || 300;
    group.videos.sort((a, b) => b.uploadedAt - a.uploadedAt);
    const removedCount = Math.max(0, group.videos.length - limit);
    group.videos = group.videos.slice(0, limit);

    if (removedCount > 0) {
      console.log(`[Storage] Removed ${removedCount} old videos to maintain limit of ${limit}`);
    }

    group.lastVideoUpdate = Date.now();
    group.updatedAt = Date.now();

    await this.setGroups(groups);
  }

  /**
   * 그룹의 모든 영상 가져오기
   */
  static async getGroupVideos(groupId: string): Promise<Video[]> {
    const group = await this.getGroup(groupId);
    return group?.videos || [];
  }

  /**
   * 여러 영상의 조회수, 발행일, duration 업데이트
   * @param forceOverwrite - true면 조회수를 무조건 새 값으로 덮어씀 (directfetch용)
   */
  static async updateVideoViewCounts(
    groupId: string,
    updates: { videoId: string; viewCount: number; uploadedAt?: number | null; duration?: string | null }[],
    forceOverwrite: boolean = false
  ): Promise<void> {
    const groups = await this.getGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group || !group.videos) return;

    const updateMap = new Map(updates.map(u => [u.videoId, u]));

    for (const video of group.videos) {
      const update = updateMap.get(video.id);
      if (update) {
        // forceOverwrite가 true면 무조건 덮어쓰기 (directfetch용)
        if (forceOverwrite) {
          if (update.viewCount > 0) {
            video.viewCount = update.viewCount;
            console.log(`[Storage] View count force updated: ${video.id} -> ${update.viewCount}`);
          }
        } else {
          // 조회수는 높은 값으로만 업데이트 (RYD API 등)
          if (update.viewCount > video.viewCount) {
            video.viewCount = update.viewCount;
            console.log(`[Storage] View count updated: ${video.id} -> ${update.viewCount}`);
          } else if (update.viewCount < video.viewCount) {
            console.log(`[Storage] View count kept (new value lower): ${video.id} - kept ${video.viewCount}, ignored ${update.viewCount}`);
          }
        }
        // 발행일도 업데이트 (있으면)
        if (update.uploadedAt && update.uploadedAt > 0) {
          video.uploadedAt = update.uploadedAt;
          video.hasExactDate = true;
        }
        // duration 업데이트 (있고, 기존 값이 0:00이거나 없을 때)
        if (update.duration && update.duration !== '0:00') {
          const oldDuration = video.duration;
          video.duration = update.duration;

          // duration 기반 isShorts 자동 판별 (3분 = 180초 미만)
          const seconds = this.parseDurationToSeconds(update.duration);
          if (seconds > 0 && seconds < 180) {
            video.isShorts = true;
            video.url = `https://www.youtube.com/shorts/${video.id}`;
          } else if (seconds >= 180) {
            video.isShorts = false;
            video.url = `https://www.youtube.com/watch?v=${video.id}`;
          }

          console.log(`[Storage] Duration updated: ${video.id} ${oldDuration} -> ${update.duration} (isShorts: ${video.isShorts})`);
        }
        // 바이럴 지수 재계산
        const hoursAge = Math.max(1, (Date.now() - video.uploadedAt) / (1000 * 60 * 60));
        video.viralScore = Math.round(video.viewCount / hoursAge);
      }
    }

    group.lastVideoUpdate = Date.now();
    group.updatedAt = Date.now();
    await this.setGroups(groups);
    console.log(`[Storage] Updated view counts for ${updates.length} videos in group ${groupId}${forceOverwrite ? ' (force)' : ''}`);
  }

  /**
   * 영상 상세정보 업데이트 (duration, isShorts, viewCount, uploadedAt)
   * YouTube API로 가져온 정보를 저장
   */
  static async updateVideoDetails(
    groupId: string,
    updates: { videoId: string; duration: string; viewCount: number; isShorts: boolean; uploadedAt?: number }[]
  ): Promise<void> {
    const groups = await this.getGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group || !group.videos) return;

    const updateMap = new Map(updates.map(u => [u.videoId, u]));
    let updatedCount = 0;

    for (const video of group.videos) {
      const update = updateMap.get(video.id);
      if (update) {
        // duration 항상 업데이트 (YouTube API에서 온 값이 더 정확함)
        video.duration = update.duration;

        // isShorts 업데이트
        video.isShorts = update.isShorts;

        // URL 업데이트 (숏폼이면 /shorts/ URL로)
        if (update.isShorts) {
          video.url = `https://www.youtube.com/shorts/${video.id}`;
        } else {
          video.url = `https://www.youtube.com/watch?v=${video.id}`;
        }

        // 조회수는 높은 값으로만 업데이트
        if (update.viewCount > video.viewCount) {
          video.viewCount = update.viewCount;
        }

        // 발행일 업데이트 (있으면)
        if (update.uploadedAt && update.uploadedAt > 0) {
          video.uploadedAt = update.uploadedAt;
          video.hasExactDate = true;
        }

        // 바이럴 지수 재계산
        const hoursAge = Math.max(1, (Date.now() - video.uploadedAt) / (1000 * 60 * 60));
        video.viralScore = Math.round(video.viewCount / hoursAge);

        updatedCount++;
      }
    }

    group.lastVideoUpdate = Date.now();
    group.updatedAt = Date.now();
    await this.setGroups(groups);
    console.log(`[Storage] Updated details for ${updatedCount} videos in group ${groupId}`);
  }


  /**
   * 영상 시청 상태 업데이트
   */
  static async markVideoAsWatched(videoId: string, watched: boolean = true): Promise<void> {
    const watchedVideos = await this.getWatchedVideos();

    if (watched) {
      watchedVideos.add(videoId);
    } else {
      watchedVideos.delete(videoId);
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.WATCHED_VIDEOS]: Array.from(watchedVideos)
    });
  }

  /**
   * 시청한 영상 ID 목록 가져오기
   */
  static async getWatchedVideos(): Promise<Set<string>> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.WATCHED_VIDEOS);
    const arr = result[STORAGE_KEYS.WATCHED_VIDEOS] || [];
    return new Set(arr);
  }

  /**
   * 영상 삭제
   */
  static async removeVideoFromGroup(groupId: string, videoId: string): Promise<void> {
    const groups = await this.getGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);

    if (group.videos) {
      group.videos = group.videos.filter(v => v.id !== videoId);
      group.updatedAt = Date.now();
      await this.setGroups(groups);
    }
  }

  /**
   * 모든 그룹의 영상 개수 합계
   */
  static async getTotalVideoCount(): Promise<number> {
    const groups = await this.getGroups();
    return groups.reduce((sum, group) => sum + (group.videos?.length || 0), 0);
  }

  /**
   * 그룹의 영상을 시청 여부로 필터링 (설정한 최대 개수 제한 적용)
   */
  static async getFilteredVideos(
    groupId: string,
    filter: 'all' | 'unwatched' | 'saved' | 'shorts' | 'longform'
  ): Promise<Video[]> {
    let videos = await this.getGroupVideos(groupId);

    // 최대 영상 개수 제한 적용
    const settings = await this.getSettings();
    const limit = settings.maxVideosPerChannel || 300;

    // 최신순 정렬 후 제한
    videos.sort((a, b) => b.uploadedAt - a.uploadedAt);
    videos = videos.slice(0, limit);

    if (filter === 'all') {
      return videos;
    }

    if (filter === 'saved') {
      const savedVideos = await this.getSavedVideos();
      return videos.filter(v => savedVideos.has(v.id));
    }

    if (filter === 'shorts') {
      return videos.filter(v => this.isShortsVideo(v));
    }

    if (filter === 'longform') {
      return videos.filter(v => !this.isShortsVideo(v));
    }

    // unwatched
    const watchedVideos = await this.getWatchedVideos();
    return videos.filter(v => !watchedVideos.has(v.id));
  }

  // ==================== 저장된 영상 (즐겨찾기) 관리 ====================

  /**
   * 저장된 영상 목록 가져오기
   */
  static async getSavedVideos(): Promise<Set<string>> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SAVED_VIDEOS);
    const arr = result[STORAGE_KEYS.SAVED_VIDEOS] || [];
    return new Set(arr);
  }

  /**
   * 영상을 저장 목록에 추가/제거
   */
  static async toggleSavedVideo(videoId: string): Promise<boolean> {
    const savedVideos = await this.getSavedVideos();

    if (savedVideos.has(videoId)) {
      savedVideos.delete(videoId);
      await chrome.storage.local.set({
        [STORAGE_KEYS.SAVED_VIDEOS]: Array.from(savedVideos)
      });
      return false; // 제거됨
    } else {
      savedVideos.add(videoId);
      await chrome.storage.local.set({
        [STORAGE_KEYS.SAVED_VIDEOS]: Array.from(savedVideos)
      });
      return true; // 추가됨
    }
  }

  /**
   * 영상이 저장되어 있는지 확인
   */
  static async isSavedVideo(videoId: string): Promise<boolean> {
    const savedVideos = await this.getSavedVideos();
    return savedVideos.has(videoId);
  }

  /**
   * 모든 그룹에서 저장된 영상들만 가져오기
   */
  static async getAllSavedVideos(): Promise<Video[]> {
    const groups = await this.getGroups();
    const savedVideoIds = await this.getSavedVideos();
    const allVideos: Video[] = [];

    for (const group of groups) {
      if (group.videos) {
        const savedInGroup = group.videos.filter(v => savedVideoIds.has(v.id));
        allVideos.push(...savedInGroup);
      }
    }

    // 중복 제거 (같은 영상이 여러 그룹에 있을 수 있음)
    const uniqueVideos = new Map<string, Video>();
    allVideos.forEach(v => {
      if (!uniqueVideos.has(v.id)) {
        uniqueVideos.set(v.id, v);
      }
    });

    return Array.from(uniqueVideos.values());
  }

  // ==================== 영상 이동/복사 관리 ====================

  /**
   * 영상을 다른 그룹으로 이동 (원래 그룹에서 삭제)
   */
  static async moveVideoToGroup(video: Video, fromGroupId: string, toGroupId: string): Promise<void> {
    const groups = await this.getGroups();

    const fromGroup = groups.find(g => g.id === fromGroupId);
    const toGroup = groups.find(g => g.id === toGroupId);

    if (!fromGroup || !toGroup) {
      throw new Error('Group not found');
    }

    // 원래 그룹에서 제거
    fromGroup.videos = (fromGroup.videos || []).filter(v => v.id !== video.id);
    fromGroup.updatedAt = Date.now();

    // 새 그룹에 추가 (중복 방지)
    const existsInTarget = (toGroup.videos || []).some(v => v.id === video.id);
    if (!existsInTarget) {
      const movedVideo = { ...video, groupId: toGroupId };
      toGroup.videos = [...(toGroup.videos || []), movedVideo];
      toGroup.updatedAt = Date.now();
    }

    await this.setGroups(groups);
    console.log(`[Storage] Moved video ${video.id} from ${fromGroup.name} to ${toGroup.name}`);
  }

  /**
   * 영상을 다른 그룹에 복사 (원래 그룹 유지)
   */
  static async copyVideoToGroup(video: Video, toGroupId: string): Promise<void> {
    const groups = await this.getGroups();
    const toGroup = groups.find(g => g.id === toGroupId);

    if (!toGroup) {
      throw new Error('Target group not found');
    }

    // 이미 있으면 스킵
    const exists = (toGroup.videos || []).some(v => v.id === video.id);
    if (exists) {
      console.log(`[Storage] Video ${video.id} already exists in ${toGroup.name}`);
      return;
    }

    const copiedVideo = { ...video, groupId: toGroupId };
    toGroup.videos = [...(toGroup.videos || []), copiedVideo];
    toGroup.updatedAt = Date.now();

    await this.setGroups(groups);
    console.log(`[Storage] Copied video ${video.id} to ${toGroup.name}`);
  }

  /**
   * 영상을 여러 그룹에 복사 (체크박스 선택용)
   */
  static async copyVideoToGroups(video: Video, targetGroupIds: string[]): Promise<void> {
    for (const groupId of targetGroupIds) {
      await this.copyVideoToGroup(video, groupId);
    }
  }

  /**
   * 다른 그룹에서 동일 영상의 최신 데이터를 가져와 동기화
   * 채널이 없는 그룹(바이럴 폴더 등)에서 HTTP 요청 없이 조회수 업데이트할 때 사용
   */
  static async syncVideosFromOtherGroups(groupId: string): Promise<number> {
    const groups = await this.getGroups();
    const targetGroup = groups.find(g => g.id === groupId);
    if (!targetGroup || !targetGroup.videos || targetGroup.videos.length === 0) {
      return 0;
    }

    // 다른 그룹들에서 동일 videoId로 데이터 수집
    const videoDataMap = new Map<string, Video>();
    for (const group of groups) {
      if (group.id === groupId) continue; // 자기 자신 제외
      for (const video of group.videos || []) {
        const existing = videoDataMap.get(video.id);
        // 조회수가 더 높거나, 기존에 없으면 저장
        if (!existing || video.viewCount > existing.viewCount) {
          videoDataMap.set(video.id, video);
        }
      }
    }

    // 타겟 그룹의 영상 업데이트
    let syncedCount = 0;
    for (const video of targetGroup.videos) {
      const sourceVideo = videoDataMap.get(video.id);
      if (sourceVideo) {
        // 조회수가 더 높으면 업데이트
        if (sourceVideo.viewCount > video.viewCount) {
          video.viewCount = sourceVideo.viewCount;
          syncedCount++;
        }
        // 기타 메타데이터도 동기화
        if (sourceVideo.viralScore) video.viralScore = sourceVideo.viralScore;
        if (sourceVideo.duration && sourceVideo.duration !== '0:00') video.duration = sourceVideo.duration;
        if (sourceVideo.hasExactDate && sourceVideo.uploadedAt) {
          video.uploadedAt = sourceVideo.uploadedAt;
          video.hasExactDate = true;
        }
      }
    }

    if (syncedCount > 0) {
      targetGroup.lastVideoUpdate = Date.now();
      targetGroup.updatedAt = Date.now();
      await this.setGroups(groups);
      console.log(`[Storage] Synced ${syncedCount} videos from other groups to ${targetGroup.name}`);
    }

    return syncedCount;
  }

  /**
   * 영상이 Shorts인지 판별
   * isShorts 플래그, duration 문자열, 또는 duration을 초로 파싱해서 3분(180초) 미만인지 체크
   */
  private static isShortsVideo(video: Video): boolean {
    // 명시적으로 Shorts로 표시된 경우
    if (video.isShorts) return true;
    if (video.duration === 'Shorts' || video.duration === 'SHORTS') return true;

    // duration을 초로 파싱해서 180초(3분) 미만인지 체크
    const seconds = this.parseDurationToSeconds(video.duration);

    // duration이 0이면 알 수 없으므로 isShorts 플래그만 사용
    if (seconds === 0) return false;

    return seconds < 180;
  }

  /**
   * duration 문자열을 초로 파싱 (예: "1:23" -> 83, "1:02:03" -> 3723)
   */
  private static parseDurationToSeconds(duration: string): number {
    if (!duration || duration === '0:00' || duration === 'Shorts' || duration === 'SHORTS') {
      return 0;
    }

    const parts = duration.split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return 0;

    if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      // MM:SS
      return parts[0] * 60 + parts[1];
    }

    return 0;
  }
}

// Export for backward compatibility
export const getGroups = StorageManager.getGroups.bind(StorageManager);
export const setGroups = StorageManager.setGroups.bind(StorageManager);
export const getSettings = StorageManager.getSettings.bind(StorageManager);
export const updateSettings = StorageManager.updateSettings.bind(StorageManager);
