import { StorageManager } from '../utils/storage';
import { VideoScraper } from '../utils/video-scraper';
import { YouTubeAPI, ApiUsageTracker } from '../utils/youtube-api';
import type { Group, Video } from '../types';

/**
 * Background Video Collector
 * 주기적으로 그룹의 채널에서 영상을 수집
 * 데이터 소스 옵션: html (기존 스크래핑) 또는 youtube_api (공식 API)
 */
export class VideoCollector {
  /**
   * 모든 그룹의 영상 수집
   */
  static async collectAllVideos(): Promise<void> {
    console.log('[VideoCollector] Starting video collection...');

    try {
      const groups = await StorageManager.getGroups();

      for (const group of groups) {
        if (group.channels.length > 0) {
          await this.collectGroupVideos(group);
        }
      }

      console.log('[VideoCollector] Collection complete');
    } catch (error) {
      console.error('[VideoCollector] Collection failed:', error);
    }
  }

  /**
   * 특정 그룹의 영상 수집 (새 영상만)
   */
  static async collectGroupVideos(group: Group): Promise<void> {
    console.log(`[VideoCollector] Collecting videos for group: ${group.name}`);

    const settings = await StorageManager.getSettings();
    const limit = settings.maxVideosPerChannel || 300;

    // 기존 영상 ID 목록 (중복 방지)
    const existingVideos = group.videos || [];
    const existingIds = new Set(existingVideos.map(v => v.id));
    console.log(`[VideoCollector] Existing videos: ${existingIds.size}`);

    let allVideos: Video[] = [];

    // 데이터 소스에 따라 다른 방식 사용
    if (settings.dataSource === 'youtube_api' && settings.youtubeApiKey) {
      // YouTube Data API 사용
      allVideos = await this.collectWithYouTubeAPI(group, settings.youtubeApiKey, limit, existingIds);
    } else {
      // 기존 HTML 스크래핑 사용
      allVideos = await this.collectWithHTMLScraping(group, limit, existingIds);
    }

    if (allVideos.length > 0) {
      await StorageManager.addVideosToGroup(group.id, allVideos);
      console.log(`[VideoCollector] Added ${allVideos.length} new videos to group ${group.name}`);
    } else {
      console.log(`[VideoCollector] No new videos found for group ${group.name}`);
      await StorageManager.updateGroupTimestamp(group.id);
    }
  }

  /**
   * YouTube Data API를 사용한 영상 수집
   */
  private static async collectWithYouTubeAPI(
    group: Group,
    apiKey: string,
    limit: number,
    existingIds: Set<string>
  ): Promise<Video[]> {
    console.log('[VideoCollector] Using YouTube Data API');
    const api = new YouTubeAPI(apiKey);
    const allVideos: Video[] = [];
    let totalUnitsUsed = 0;

    for (const channel of group.channels) {
      try {
        const { videos, unitsUsed } = await api.searchVideos(channel, group.id, Math.min(limit, 50));
        totalUnitsUsed += unitsUsed;

        // 새 영상만 필터링
        const newVideos = videos.filter(v => !existingIds.has(v.id));
        allVideos.push(...newVideos);

        console.log(`[VideoCollector] API: ${newVideos.length} new videos from ${channel.name} (${unitsUsed} units)`);

        // 짧은 딜레이 (API는 빠르므로 500ms면 충분)
        await this.sleep(500);
      } catch (error) {
        console.error(`[VideoCollector] API failed for ${channel.name}:`, error);
      }
    }

    // API 사용량 기록
    if (totalUnitsUsed > 0) {
      await ApiUsageTracker.addUsage(totalUnitsUsed);
    }

    return allVideos;
  }

  /**
   * HTML 스크래핑을 사용한 영상 수집 (기존 방식)
   */
  private static async collectWithHTMLScraping(
    group: Group,
    limit: number,
    existingIds: Set<string>
  ): Promise<Video[]> {
    console.log('[VideoCollector] Using HTML scraping');
    const allVideos: Video[] = [];

    for (const channel of group.channels) {
      try {
        const videos = await VideoScraper.scrapeChannelVideos(channel, group.id, limit, existingIds);
        allVideos.push(...videos);
        console.log(`[VideoCollector] Scraped ${videos.length} videos from ${channel.name}`);

        // Rate limiting
        await this.sleep(1000);
      } catch (error) {
        console.error(`[VideoCollector] Scraping failed for ${channel.name}:`, error);
      }
    }

    return allVideos;
  }

  /**
   * Sleep helper
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

