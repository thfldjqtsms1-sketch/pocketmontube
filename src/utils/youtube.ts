import type { Channel } from '../types';

/**
 * YouTube DOM 파싱 유틸리티
 * 2025년 최신 YouTube UI 대응
 */
export class YouTubeParser {
  /**
   * 현재 페이지에서 채널 정보 추출
   */
  static extractChannelFromPage(): Channel | null {
    // Channel page detection
    const channelId = this.getChannelIdFromUrl();
    if (!channelId) return null;

    const channelName = this.getChannelName();
    const thumbnail = this.getChannelThumbnail();
    const handle = this.getChannelHandle();

    return {
      id: channelId,
      name: channelName ?? 'Unknown Channel',
      thumbnail,
      handle
    };
  }

  /**
   * URL에서 채널 ID 추출
   */
  static getChannelIdFromUrl(): string | null {
    const url = window.location.href;

    // New format: /@handle
    const handleMatch = url.match(/\/@([^\/\?]+)/);
    if (handleMatch) {
      // Handle을 ID로 변환해야 하지만, 일단 handle을 ID로 사용
      return `@${handleMatch[1]}`;
    }

    // Old format: /channel/UCxxxxxx
    const channelMatch = url.match(/\/channel\/([^\/\?]+)/);
    if (channelMatch) {
      return channelMatch[1];
    }

    // User format: /user/username
    const userMatch = url.match(/\/user\/([^\/\?]+)/);
    if (userMatch) {
      return `user:${userMatch[1]}`;
    }

    return null;
  }

  /**
   * 채널 이름 가져오기
   */
  static getChannelName(): string | null {
    // Try multiple selectors for robustness (2025 최신 UI 대응)
    const selectors = [
      // 사용자 제안 셀렉터 (2025년 12월 최신) - 구체적 경로
      '#page-header yt-page-header-view-model .yt-page-header-view-model__page-header-headline span.yt-core-attributed-string[role="text"]',
      '#page-header .yt-page-header-view-model__page-header-headline span.yt-core-attributed-string',
      'yt-page-header-view-model yt-dynamic-text-view-model span.yt-core-attributed-string',
      // 새로운 UI
      '#channel-header ytd-channel-name yt-formatted-string#text',
      '#channel-header-container ytd-channel-name yt-formatted-string',
      'ytd-c4-tabbed-header-renderer yt-formatted-string.ytd-channel-name',
      // 기존 UI
      'ytd-channel-name#channel-name yt-formatted-string',
      '#channel-header-container #channel-name',
      'yt-formatted-string.ytd-channel-name',
      // 폴백
      '#inner-header-container #channel-name',
      '#header ytd-channel-name'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    // 페이지 타이틀에서 추출 시도
    const title = document.title;
    if (title && !title.includes(' - YouTube')) {
      return title.replace(' - YouTube', '').trim();
    }

    return null;
  }

  /**
   * 채널 썸네일 가져오기
   */
  static getChannelThumbnail(): string | undefined {
    // 2025 최신 UI 셀렉터
    const selectors = [
      // 사용자 제안 셀렉터 (2025년 12월 최신)
      '#page-header yt-page-header-renderer yt-decorated-avatar-view-model yt-avatar-shape img',
      '#page-header yt-avatar-shape img',
      '.yt-spec-avatar-shape__image img',
      'yt-spec-avatar-shape img',
      // 새로운 UI
      '#channel-header-container #avatar img',
      '#channel-header #avatar img',
      'ytd-c4-tabbed-header-renderer #avatar img',
      'yt-avatar-shape img',
      // 기존 UI
      'ytd-c4-tabbed-header-renderer img#avatar',
      '#avatar img',
      // 프로필 이미지
      '#channel-header-container yt-img-shadow img',
      'ytd-c4-tabbed-header-renderer yt-img-shadow img'
    ];

    for (const selector of selectors) {
      const img = document.querySelector<HTMLImageElement>(selector);
      if (img?.src && !img.src.includes('placeholder')) {
        return img.src;
      }
    }

    return undefined;
  }

  /**
   * 채널 핸들 가져오기
   */
  static getChannelHandle(): string | undefined {
    const handleElement = document.querySelector('#channel-handle');
    return handleElement?.textContent?.trim();
  }

  /**
   * 구독 버튼 찾기
   */
  static getSubscribeButton(): HTMLElement | null {
    return document.querySelector('#subscribe-button button, ytd-subscribe-button-renderer button');
  }

  /**
   * 구독 중인지 확인
   */
  static isSubscribed(): boolean {
    const button = this.getSubscribeButton();
    if (!button) return false;

    const text = button.textContent?.toLowerCase() ?? '';
    return text.includes('구독중') || text.includes('subscribed');
  }

  /**
   * YouTube Sidebar 엘리먼트 찾기
   */
  static getSidebar(): HTMLElement | null {
    return document.querySelector('#guide-content, ytd-guide-renderer');
  }

  /**
   * 구독 섹션 찾기
   */
  static getSubscriptionsSection(): HTMLElement | null {
    return document.querySelector('#sections ytd-guide-section-renderer:nth-child(2)');
  }
}

/**
 * YouTube URL 생성 유틸리티
 */
export class YouTubeUrl {
  static channelUrl(channelId: string): string {
    if (channelId.startsWith('@')) {
      return `https://www.youtube.com/${channelId}`;
    }
    if (channelId.startsWith('user:')) {
      return `https://www.youtube.com/user/${channelId.slice(5)}`;
    }
    return `https://www.youtube.com/channel/${channelId}`;
  }

  static searchUrl(query: string): string {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }
}
