import type { Video, Channel } from '../types';

/**
 * YouTube 영상 스크래핑 유틸리티
 * 채널 페이지에서 최신 영상 목록을 추출
 */
export class VideoScraper {
  /**
   * 채널 페이지에서 영상 목록 스크래핑
   * @param channel 채널 정보
   * @param groupId 그룹 ID
   * @param limit 최대 영상 개수 (기본값 300, 옵션: 100/300/500/800)
   * @param existingIds 기존 영상 ID Set (중복 수집 방지)
   * @returns Promise<Video[]>
   */
  static async scrapeChannelVideos(
    channel: Channel,
    groupId: string,
    limit: number = 300,
    existingIds: Set<string> = new Set()
  ): Promise<Video[]> {
    try {
      // 일반 영상 수집
      const videosUrl = this.getChannelVideosUrl(channel.id);
      const videosHtml = await this.fetchChannelPage(videosUrl);
      const videos = this.parseVideosFromHTML(videosHtml, channel, groupId, false);

      // Shorts 수집
      const shortsUrl = this.getChannelShortsUrl(channel.id);
      const shortsHtml = await this.fetchChannelPage(shortsUrl);
      const shorts = this.parseShortsFromHTML(shortsHtml, channel, groupId);

      // 합치고 제한
      let allVideos = [...videos, ...shorts].slice(0, limit);

      // 새 영상만 필터링 (이미 있는 영상은 스킵)
      const newVideos = allVideos.filter(v => !existingIds.has(v.id));
      const skippedCount = allVideos.length - newVideos.length;

      if (skippedCount > 0) {
        console.log(`[VideoScraper] Skipped ${skippedCount} existing videos`);
      }

      if (newVideos.length === 0) {
        console.log(`[VideoScraper] No new videos found for ${channel.name}`);
        return [];
      }

      // 정확한 발행 시간 가져오기 비활성화 (너무 느리고 멈춤)
      // 채널 페이지에서 파싱한 대략적인 시간으로 충분함
      console.log(`[VideoScraper] Using approximate upload times for ${newVideos.length} videos (exact fetch disabled)`);
      let processedVideos = newVideos;

      // 바이럴 지수 계산 (시간당 조회수)
      processedVideos = this.calculateViralScores(processedVideos);

      // 정렬
      processedVideos.sort((a, b) => b.uploadedAt - a.uploadedAt);

      return processedVideos;
    } catch (error) {
      console.error(`[VideoScraper] Failed to scrape channel ${channel.id}:`, error);
      return [];
    }
  }

  /**
   * 영상들의 정확한 발행 시간을 가져옴 (병렬 배치 처리)
   * hasExactDate가 true인 영상은 스킵
   *
   * 비활성화됨: 너무 느리고 멈춤 현상 발생
   */
  /* private static async fetchExactUploadTimes(videos: Video[]): Promise<Video[]> {
    const BATCH_SIZE = 5; // 동시에 5개씩 요청
    const DELAY_MS = 500; // 배치 사이 딜레이

    // 이미 정확한 날짜가 있는 영상은 스킵
    const videosNeedingFetch = videos.filter(v => !v.hasExactDate);
    const videosAlreadyParsed = videos.filter(v => v.hasExactDate);

    if (videosAlreadyParsed.length > 0) {
      console.log(`[VideoScraper] Skipping ${videosAlreadyParsed.length} videos with exact dates`);
    }

    if (videosNeedingFetch.length === 0) {
      console.log(`[VideoScraper] All videos already have exact dates`);
      return videos;
    }

    console.log(`[VideoScraper] Fetching exact dates for ${videosNeedingFetch.length} videos`);
    const results: Video[] = [...videosAlreadyParsed];

    for (let i = 0; i < videosNeedingFetch.length; i += BATCH_SIZE) {
      const batch = videosNeedingFetch.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (video) => {
          try {
            const exactTime = await this.fetchVideoUploadTime(video.id, video.isShorts);
            if (exactTime) {
              return { ...video, uploadedAt: exactTime, hasExactDate: true };
            }
          } catch (error) {
            console.warn(`[VideoScraper] Failed to get upload time for ${video.id}`);
          }
          return video; // 실패하면 기존 시간 유지
        })
      );

      results.push(...batchResults);

      // 다음 배치 전 딜레이 (마지막 배치가 아닌 경우)
      if (i + BATCH_SIZE < videosNeedingFetch.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    return results;
  } */

  /**
   * 개별 영상 페이지에서 정확한 발행 시간 추출
   * 셀렉터: #factoids > upload-time-factoid-renderer > factoid-renderer > div
   *
   * 비활성화됨: 너무 느리고 멈춤 현상 발생
   */
  /* private static async fetchVideoUploadTime(videoId: string, isShorts?: boolean): Promise<number | null> {
    try {
      const url = isShorts
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`;

      console.log(`[VideoScraper] Fetching upload time for ${videoId} from ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[VideoScraper] Failed to fetch ${url}: HTTP ${response.status}`);
        return null;
      }

      const html = await response.text();
      console.log(`[VideoScraper] Received ${html.length} bytes of HTML for ${videoId}`);

      // ytInitialPlayerResponse에서 publishDate 추출 시도
      const playerResponseMatch = html.match(/var ytInitialPlayerResponse = ({.*?});/s);
      if (playerResponseMatch) {
        try {
          const data = JSON.parse(playerResponseMatch[1]);
          const publishDate = data?.microformat?.playerMicroformatRenderer?.publishDate;
          if (publishDate) {
            console.log(`[VideoScraper] ✓ Found publishDate for ${videoId}: ${publishDate}`);
            return new Date(publishDate).getTime();
          } else {
            console.log(`[VideoScraper] No publishDate in playerMicroformatRenderer for ${videoId}`);
          }
        } catch (e) {
          console.warn(`[VideoScraper] Failed to parse ytInitialPlayerResponse for ${videoId}:`, e);
        }
      } else {
        console.log(`[VideoScraper] No ytInitialPlayerResponse found for ${videoId}`);
      }

      // ytInitialData에서 uploadDate 추출 시도
      const initialDataMatch = html.match(/var ytInitialData = ({.*?});/s);
      if (initialDataMatch) {
        try {
          const data = JSON.parse(initialDataMatch[1]);
          // 영상 상세 페이지의 dateText 찾기
          const dateText = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents
            ?.find((c: any) => c.videoPrimaryInfoRenderer)
            ?.videoPrimaryInfoRenderer?.dateText?.simpleText;
          if (dateText) {
            console.log(`[VideoScraper] ✓ Found dateText for ${videoId}: ${dateText}`);
            const parsed = this.parseDateText(dateText);
            if (parsed) {
              return parsed;
            }
          } else {
            console.log(`[VideoScraper] No dateText in videoPrimaryInfoRenderer for ${videoId}`);
          }
        } catch (e) {
          console.warn(`[VideoScraper] Failed to parse ytInitialData for ${videoId}:`, e);
        }
      } else {
        console.log(`[VideoScraper] No ytInitialData found for ${videoId}`);
      }

      console.warn(`[VideoScraper] ✗ Could not extract upload time for ${videoId}`);
      return null;
    } catch (error) {
      console.error(`[VideoScraper] Error fetching upload time for ${videoId}:`, error);
      return null;
    }
  } */

  /**
   * 날짜 텍스트 파싱 (예: "2024. 12. 20.", "Dec 20, 2024")
   *
   * 비활성화됨: fetchVideoUploadTime과 함께 비활성화
   */
  /* private static parseDateText(dateText: string): number | null {
    try {
      console.log(`[VideoScraper] Parsing date text: "${dateText}"`);

      // 한국어 형식: "2024. 12. 20." 또는 "2024년 12월 20일"
      let match = dateText.match(/(\d{4})[.\s년]+\s*(\d{1,2})[.\s월]+\s*(\d{1,2})/);
      if (match) {
        const result = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3])).getTime();
        console.log(`[VideoScraper] Parsed Korean date: ${new Date(result).toISOString()}`);
        return result;
      }

      // 영어 형식: "Dec 20, 2024" 또는 "December 20, 2024"
      const parsed = new Date(dateText);
      if (!isNaN(parsed.getTime())) {
        console.log(`[VideoScraper] Parsed English date: ${parsed.toISOString()}`);
        return parsed.getTime();
      }

      console.warn(`[VideoScraper] Could not parse date text: "${dateText}"`);
      return null;
    } catch (e) {
      console.error(`[VideoScraper] Error parsing date text "${dateText}":`, e);
      return null;
    }
  } */

  /**
   * 바이럴 지수 계산 (시간당 조회수)
   * 공식: 조회수 / 경과 시간(시간)
   */
  private static calculateViralScores(videos: Video[]): Video[] {
    const now = Date.now();

    return videos.map(video => {
      const hoursAge = Math.max(1, (now - video.uploadedAt) / (1000 * 60 * 60)); // 최소 1시간
      const viralScore = Math.round(video.viewCount / hoursAge);

      return { ...video, viralScore };
    });
  }

  /**
   * 채널의 /videos 페이지 URL 생성
   */
  private static getChannelVideosUrl(channelId: string): string {
    if (channelId.startsWith('@')) {
      return `https://www.youtube.com/${channelId}/videos`;
    }
    if (channelId.startsWith('user:')) {
      return `https://www.youtube.com/user/${channelId.slice(5)}/videos`;
    }
    return `https://www.youtube.com/channel/${channelId}/videos`;
  }

  /**
   * 채널의 /shorts 페이지 URL 생성
   */
  private static getChannelShortsUrl(channelId: string): string {
    if (channelId.startsWith('@')) {
      return `https://www.youtube.com/${channelId}/shorts`;
    }
    if (channelId.startsWith('user:')) {
      return `https://www.youtube.com/user/${channelId.slice(5)}/shorts`;
    }
    return `https://www.youtube.com/channel/${channelId}/shorts`;
  }

  /**
   * Fetch channel page HTML
   */
  private static async fetchChannelPage(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  }

  /**
   * HTML에서 영상 데이터 파싱
   * YouTube의 ytInitialData에서 영상 정보 추출
   */
  private static parseVideosFromHTML(
    html: string,
    channel: Channel,
    groupId: string,
    isShorts: boolean = false
  ): Video[] {
    const videos: Video[] = [];

    try {
      // YouTube의 ytInitialData JSON 찾기
      const match = html.match(/var ytInitialData = ({.*?});/s);
      if (!match) {
        console.warn('[VideoScraper] ytInitialData not found');
        return [];
      }

      const data = JSON.parse(match[1]);

      // 영상 렌더러 찾기
      const contents =
        data?.contents?.twoColumnBrowseResultsRenderer?.tabs
          ?.find((tab: any) => tab.tabRenderer?.selected)
          ?.tabRenderer?.content?.richGridRenderer?.contents || [];

      for (const item of contents) {
        const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
        if (!videoRenderer) continue;

        const video = this.parseVideoRenderer(videoRenderer, channel, groupId, isShorts);
        if (video) {
          videos.push(video);
        }
      }
    } catch (error) {
      console.error('[VideoScraper] Parse error:', error);
    }

    return videos;
  }

  /**
   * Shorts HTML에서 영상 데이터 파싱
   */
  private static parseShortsFromHTML(
    html: string,
    channel: Channel,
    groupId: string
  ): Video[] {
    const videos: Video[] = [];

    try {
      const match = html.match(/var ytInitialData = ({.*?});/s);
      if (!match) return [];

      const data = JSON.parse(match[1]);

      // Shorts 렌더러 찾기 (reelShelfRenderer 또는 richGridRenderer)
      const contents =
        data?.contents?.twoColumnBrowseResultsRenderer?.tabs
          ?.find((tab: any) => tab.tabRenderer?.selected)
          ?.tabRenderer?.content?.richGridRenderer?.contents || [];

      for (const item of contents) {
        // Shorts는 reelItemRenderer 형식
        const reelRenderer = item?.richItemRenderer?.content?.reelItemRenderer;
        if (reelRenderer) {
          const video = this.parseReelRenderer(reelRenderer, channel, groupId);
          if (video) videos.push(video);
          continue;
        }

        // 또는 shortsLockupViewModel 형식
        const shortsModel = item?.richItemRenderer?.content?.shortsLockupViewModel;
        if (shortsModel) {
          const video = this.parseShortsViewModel(shortsModel, channel, groupId);
          if (video) videos.push(video);
        }
      }
    } catch (error) {
      console.error('[VideoScraper] Shorts parse error:', error);
    }

    return videos;
  }

  /**
   * reelItemRenderer에서 Shorts Video 생성
   */
  private static parseReelRenderer(
    renderer: any,
    channel: Channel,
    groupId: string
  ): Video | null {
    try {
      const videoId = renderer.videoId;
      if (!videoId) return null;

      const title = renderer.headline?.simpleText || 'Shorts';
      // 썸네일 fallback: 비어있으면 YouTube 기본 썸네일 사용
      let thumbnail = renderer.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
      if (!thumbnail) {
        thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }

      // 조회수 파싱
      const viewCountText = renderer.viewCountText?.simpleText ||
        renderer.viewCountText?.runs?.[0]?.text || '';
      const viewCount = this.parseViewCount(viewCountText);

      // 발행 시간 파싱 - accessibilityData에서 추출 시도
      let publishedText = '';
      const accessLabel = renderer.accessibility?.accessibilityData?.label || '';
      // accessibilityData에 "조회수 123회 늦 1일 전" 형식으로 포함될 수 있음
      const timeMatch = accessLabel.match(/((\d+)\s*(초|분|시간|일|주|개월|년|second|minute|hour|day|week|month|year)s?\s*(전|ago)?)/i);
      if (timeMatch) {
        publishedText = timeMatch[0];
      }
      const uploadedAt = this.parsePublishedTime(publishedText);

      return {
        id: videoId,
        title,
        channelId: channel.id,
        channelName: channel.name || 'Unknown Channel',
        thumbnail,
        duration: 'Shorts',
        viewCount,
        uploadedAt,
        url: `https://www.youtube.com/shorts/${videoId}`,
        watched: false,
        groupId,
        isShorts: true
      };
    } catch (error) {
      return null;
    }
  }

  private static parseShortsViewModel(
    model: any,
    channel: Channel,
    groupId: string
  ): Video | null {
    try {
      // videoId 추출 (onTap.innertubeCommand.reelWatchEndpoint.videoId)
      const videoId = model.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
      if (!videoId) return null;

      const title = model.overlayMetadata?.primaryText?.content || 'Shorts';
      // 썸네일 fallback: 비어있으면 YouTube 기본 썸네일 사용
      let thumbnail = model.thumbnail?.sources?.slice(-1)[0]?.url || '';
      if (!thumbnail) {
        thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }

      // 조회수 파싱
      const viewCountText = model.overlayMetadata?.secondaryText?.content || '';
      const viewCount = this.parseViewCount(viewCountText);

      // 발행 시간 파싱 - accessibilityText 또는 tertiaryText에서 추출 시도
      let publishedText = model.overlayMetadata?.tertiaryText?.content || '';
      if (!publishedText) {
        // accessibilityText에서 시간 정보 추출
        const accessLabel = model.accessibilityText || '';
        const timeMatch = accessLabel.match(/((\d+)\s*(초|분|시간|일|주|개월|년|second|minute|hour|day|week|month|year)s?\s*(전|ago)?)/i);
        if (timeMatch) {
          publishedText = timeMatch[0];
        }
      }
      const uploadedAt = this.parsePublishedTime(publishedText);

      return {
        id: videoId,
        title,
        channelId: channel.id,
        channelName: channel.name || 'Unknown Channel',
        thumbnail,
        duration: 'Shorts',
        viewCount,
        uploadedAt,
        url: `https://www.youtube.com/shorts/${videoId}`,
        watched: false,
        groupId,
        isShorts: true
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * videoRenderer 객체에서 Video 생성
   */
  private static parseVideoRenderer(
    renderer: any,
    channel: Channel,
    groupId: string,
    isShorts: boolean = false
  ): Video | null {
    try {
      const videoId = renderer.videoId;
      if (!videoId) return null;

      const title = renderer.title?.runs?.[0]?.text || 'Unknown';
      // 썸네일 fallback: 비어있으면 YouTube 기본 썸네일 사용
      let thumbnail = renderer.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
      if (!thumbnail) {
        thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }
      const duration = this.parseDuration(renderer.lengthText?.simpleText);

      // viewCountText: simpleText 또는 runs 형식 지원
      const viewCountText = renderer.viewCountText?.simpleText ||
        renderer.viewCountText?.runs?.[0]?.text || '';
      const viewCount = this.parseViewCount(viewCountText);

      // publishedTimeText: simpleText 또는 runs 형식 지원
      const publishedText = renderer.publishedTimeText?.simpleText ||
        renderer.publishedTimeText?.runs?.[0]?.text || '';
      const uploadedAt = this.parsePublishedTime(publishedText);

      // 채널명이 없으면 channel.name 사용, 그것도 없으면 'Unknown Channel'
      const channelName = channel.name || 'Unknown Channel';

      return {
        id: videoId,
        title,
        channelId: channel.id,
        channelName,
        thumbnail,
        duration,
        viewCount,
        uploadedAt,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        watched: false,
        groupId,
        isShorts
      };
    } catch (error) {
      console.error('[VideoScraper] Failed to parse video:', error);
      return null;
    }
  }

  /**
   * Duration 파싱 (예: "12:34" -> "12:34")
   */
  private static parseDuration(durationText?: string): string {
    return durationText || '0:00';
  }

  /**
   * 조회수 파싱 (영어: "1.2M views", 한국어: "조회수 1.2만회")
   */
  private static parseViewCount(viewText?: string): number {
    if (!viewText) return 0;

    // 숫자만 추출 (1.2, 183 등)
    const numMatch = viewText.match(/([\d,.]+)/);
    if (!numMatch) return 0;

    // 콤마 제거 후 숫자 변환
    const num = parseFloat(numMatch[1].replace(/,/g, ''));
    if (isNaN(num)) return 0;

    // 한국어 단위 확인
    if (viewText.includes('억')) return Math.floor(num * 100000000);
    if (viewText.includes('만')) return Math.floor(num * 10000);
    if (viewText.includes('천')) return Math.floor(num * 1000);

    // 영어 단위 확인
    if (viewText.includes('B')) return Math.floor(num * 1000000000);
    if (viewText.includes('M')) return Math.floor(num * 1000000);
    if (viewText.includes('K')) return Math.floor(num * 1000);

    return Math.floor(num);
  }

  /**
   * 업로드 시간 파싱 (영어: "2 days ago", 한국어: "2일 전")
   * 정확한 날짜가 아니므로 대략적인 timestamp 반환
   */
  private static parsePublishedTime(publishedText?: string): number {
    if (!publishedText) return Date.now();

    const now = Date.now();
    const text = publishedText.toLowerCase();

    // 숫자 추출
    const numMatch = text.match(/(\d+)/);
    if (!numMatch) return now;

    const value = parseInt(numMatch[1]);

    // 시간 단위 매칭 (긴 단어부터 우선 체크)
    // 한국어
    if (text.includes('개월') || text.includes('month')) return now - (value * 30 * 24 * 60 * 60 * 1000);
    if (text.includes('시간') || text.includes('hour')) return now - (value * 60 * 60 * 1000);
    if (text.includes('년') || text.includes('year')) return now - (value * 365 * 24 * 60 * 60 * 1000);
    if (text.includes('주') || text.includes('week')) return now - (value * 7 * 24 * 60 * 60 * 1000);
    if (text.includes('일') || text.includes('day')) return now - (value * 24 * 60 * 60 * 1000);
    if (text.includes('분') || text.includes('minute')) return now - (value * 60 * 1000);
    if (text.includes('초') || text.includes('second')) return now - (value * 1000);

    return now;
  }
}

/**
 * 현재 페이지에서 영상 목록 직접 추출 (Content Script용)
 */
export class DOMVideoScraper {
  /**
   * 현재 페이지의 영상 목록 추출
   */
  static scrapeVideosFromPage(channel: Channel, groupId: string): Video[] {
    const videos: Video[] = [];

    // ytd-rich-item-renderer 또는 ytd-grid-video-renderer 찾기
    const selectors = [
      'ytd-rich-item-renderer',
      'ytd-grid-video-renderer',
      'ytd-video-renderer'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          const video = this.extractVideoFromElement(el as HTMLElement, channel, groupId);
          if (video) videos.push(video);
        });
        break;
      }
    }

    return videos;
  }

  /**
   * DOM 엘리먼트에서 영상 정보 추출
   */
  private static extractVideoFromElement(
    element: HTMLElement,
    channel: Channel,
    groupId: string
  ): Video | null {
    try {
      // 비디오 링크
      const linkEl = element.querySelector('a#video-title-link, a#video-title') as HTMLAnchorElement;
      if (!linkEl) return null;

      const url = linkEl.href;
      const videoId = new URL(url).searchParams.get('v');
      if (!videoId) return null;

      // 제목
      const title = linkEl.getAttribute('title') || linkEl.textContent?.trim() || 'Unknown';

      // 썸네일
      const thumbnailEl = element.querySelector('img') as HTMLImageElement;
      const thumbnail = thumbnailEl?.src || '';

      // 재생시간
      const durationEl = element.querySelector('#time-status span, .ytd-thumbnail-overlay-time-status-renderer');
      const duration = durationEl?.textContent?.trim() || '0:00';

      // 조회수
      const viewsEl = element.querySelector('#metadata-line span');
      const viewCount = this.parseViewCountFromText(viewsEl?.textContent || '');

      // 업로드 시간
      const timeEl = element.querySelectorAll('#metadata-line span')[1];
      const uploadedAt = this.parseTimeAgo(timeEl?.textContent || '');

      return {
        id: videoId,
        title,
        channelId: channel.id,
        channelName: channel.name,
        thumbnail,
        duration,
        viewCount,
        uploadedAt,
        url,
        watched: false,
        groupId
      };
    } catch (error) {
      console.error('[DOMVideoScraper] Failed to extract video:', error);
      return null;
    }
  }

  private static parseViewCountFromText(text: string): number {
    const match = text.match(/([\d,]+)/);
    if (!match) return 0;
    return parseInt(match[1].replace(/,/g, ''));
  }

  private static parseTimeAgo(text: string): number {
    const now = Date.now();
    const match = text.match(/(\d+)\s*(초|분|시간|일|주|개월|년)/);
    if (!match) return now;

    const value = parseInt(match[1]);
    const unit = match[2];

    const unitMs: Record<string, number> = {
      '초': 1000,
      '분': 60 * 1000,
      '시간': 60 * 60 * 1000,
      '일': 24 * 60 * 60 * 1000,
      '주': 7 * 24 * 60 * 60 * 1000,
      '개월': 30 * 24 * 60 * 60 * 1000,
      '년': 365 * 24 * 60 * 60 * 1000
    };

    return now - (value * (unitMs[unit] || 0));
  }
}
