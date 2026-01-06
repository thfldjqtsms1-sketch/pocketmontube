import { StorageManager } from '../utils/storage';
import type { Video, Group, SortOption, FilterOption, VideoLimitOption } from '../types';

/**
 * YouTube 페이지 내부에 주입되는 인페이지 앱
 * PockeTube 스타일 - YouTube 홈에 그룹 카드 표시, 클릭 시 오버레이
 */
export class InPageApp {
  private groups: Group[] = [];
  private currentOverlay: HTMLElement | null = null;
  private currentGroupId: string | null = null;
  private sortBy: SortOption = 'date';
  private filterBy: FilterOption = 'all';
  private videoLimit: VideoLimitOption = 300;

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadGroups();
    this.injectGroupCards();
    this.setupStorageListener();
  }

  private async loadGroups() {
    this.groups = await StorageManager.getGroups();
  }

  private setupStorageListener() {
    StorageManager.onChanged((changes) => {
      if (changes.groups) {
        this.groups = changes.groups;
        this.injectGroupCards();
      }
    });
  }

  /**
   * YouTube 홈페이지에 그룹 카드들 주입
   */
  private injectGroupCards() {
    // 홈페이지가 아니면 스킵
    if (window.location.pathname !== '/') return;

    // 기존 카드 제거
    const existing = document.querySelector('#pocketmontube-cards');
    if (existing) existing.remove();

    if (this.groups.length === 0) return;

    // YouTube 컨텐츠 영역 찾기
    const primaryContent = document.querySelector('ytd-rich-grid-renderer, #contents.ytd-rich-grid-renderer');
    if (!primaryContent) {
      // 재시도
      setTimeout(() => this.injectGroupCards(), 1000);
      return;
    }

    // 그룹 카드 컨테이너 생성
    const container = document.createElement('div');
    container.id = 'pocketmontube-cards';
    container.className = 'pocketmontube-cards-container';

    container.innerHTML = `
      <div class="pocketmontube-section-header">
        <h2 class="pocketmontube-section-title">
          <span class="pocketmontube-logo">📺</span>
          구독 그룹
        </h2>
        <div class="pocketmontube-header-buttons">
          <button type="button" class="pocketmontube-github-sync-btn" title="GitHub에서 데이터 동기화">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub 동기화
          </button>
          <button type="button" class="pocketmontube-export-btn" title="채널 목록 내보내기 (GitHub 업로드용)">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            내보내기
          </button>
          <button type="button" class="pocketmontube-refresh-all-btn" title="모든 그룹 새로고침">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            전체 수집
          </button>
        </div>
      </div>
      <div class="pocketmontube-cards-grid">
        ${this.groups.map(group => this.renderGroupCard(group)).join('')}
      </div>
    `;

    // 첫 번째 위치에 삽입
    primaryContent.parentElement?.insertBefore(container, primaryContent);

    // 이벤트 연결
    this.attachCardEvents(container);
  }

  /**
   * 개별 그룹 카드 렌더링
   */
  private renderGroupCard(group: Group): string {
    const videoCount = group.videos?.length || 0;
    const channelCount = group.channels?.length || 0;

    // 최근 영상 썸네일 4개
    const recentThumbs = (group.videos || [])
      .slice(0, 4)
      .map(v => v.thumbnail);

    return `
      <div class="pocketmontube-group-card" data-group-id="${group.id}">
        <div class="pocketmontube-card-thumbnails">
          ${recentThumbs.length > 0
        ? recentThumbs.map(thumb => `<img src="${thumb}" alt="" loading="lazy">`).join('')
        : '<div class="pocketmontube-no-videos">영상 없음</div>'
      }
        </div>
        <div class="pocketmontube-card-info">
          <span class="pocketmontube-card-icon">${group.icon || '📁'}</span>
          <div class="pocketmontube-card-text">
            <h3 class="pocketmontube-card-name">${this.escapeHtml(group.name)}</h3>
            <p class="pocketmontube-card-meta">${videoCount}개 영상 · ${channelCount}개 채널</p>
          </div>
        </div>
        <button class="pocketmontube-more-btn" data-group-id="${group.id}">
          더 보기
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
        </button>
      </div>
    `;
  }

  /**
   * 카드 클릭 이벤트 연결
   */
  private attachCardEvents(container: HTMLElement) {
    container.querySelectorAll('.pocketmontube-more-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const groupId = (btn as HTMLElement).dataset.groupId!;
        this.showOverlay(groupId);
      });
    });

    container.querySelectorAll('.pocketmontube-group-card').forEach(card => {
      card.addEventListener('click', () => {
        const groupId = (card as HTMLElement).dataset.groupId!;
        this.showOverlay(groupId);
      });
    });

    // 전체 수집 버튼 (진행률 표시 포함)
    container.querySelector('.pocketmontube-refresh-all-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const btn = e.currentTarget as HTMLButtonElement;
      const originalText = btn.innerHTML;
      const totalGroups = this.groups.length;

      btn.disabled = true;

      // 수집 진행률 메시지 리스너
      const progressListener = (message: any) => {
        if (message.type === 'COLLECT_PROGRESS') {
          btn.innerHTML = `
            <svg class="spinning" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            수집 중 (${message.current}/${message.total})
          `;
        }
      };
      chrome.runtime.onMessage.addListener(progressListener);

      btn.innerHTML = `
        <svg class="spinning" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
        수집 중 (0/${totalGroups})
      `;

      try {
        const response = await chrome.runtime.sendMessage({ type: 'REFRESH_ALL_GROUPS_WITH_PROGRESS' });
        console.log('[InPageApp] Refresh all response:', response);

        // 그룹 데이터 다시 로드
        this.groups = await StorageManager.getGroups();
        this.injectGroupCards();
      } catch (error) {
        console.error('[InPageApp] Refresh all failed:', error);
      } finally {
        chrome.runtime.onMessage.removeListener(progressListener);
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });

    // GitHub 동기화 버튼
    container.querySelector('.pocketmontube-github-sync-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const btn = e.currentTarget as HTMLButtonElement;
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `
        <svg class="spinning" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        동기화 중...
      `;

      try {
        const response = await chrome.runtime.sendMessage({ type: 'SYNC_FROM_GITHUB' });
        console.log('[InPageApp] GitHub sync response:', response);

        if (response?.success) {
          alert(`GitHub 동기화 완료!\n새 영상 ${response.merged}개 추가됨\n마지막 업데이트: ${response.lastUpdated || 'N/A'}`);
          // 그룹 데이터 다시 로드
          this.groups = await StorageManager.getGroups();
          this.injectGroupCards();
        } else {
          alert('동기화 실패: ' + (response?.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('[InPageApp] GitHub sync failed:', error);
        alert('동기화 실패: ' + error);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });

    // 채널 내보내기 버튼
    container.querySelector('.pocketmontube-export-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const response = await chrome.runtime.sendMessage({ type: 'EXPORT_CHANNELS' });
        console.log('[InPageApp] Export response:', response);

        if (response?.success) {
          // JSON 파일로 다운로드
          const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'channels.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          alert('채널 목록이 다운로드되었습니다!\nGitHub 리포지토리의 data/channels.json에 업로드하세요.');
        } else {
          alert('내보내기 실패: ' + (response?.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('[InPageApp] Export failed:', error);
        alert('내보내기 실패: ' + error);
      }
    });
  }

  /**
   * 인페이지 오버레이 표시
   */
  async showOverlay(groupId: string) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    // 기존 오버레이 제거 (currentGroupId를 null로 설정함)
    this.closeOverlay();

    // currentGroupId 설정 (closeOverlay 호출 후!)
    this.currentGroupId = groupId;

    // 설정 로드
    const settings = await StorageManager.getSettings();
    this.videoLimit = (settings.maxVideosPerChannel || 300) as VideoLimitOption;

    // 오버레이 생성
    this.currentOverlay = document.createElement('div');
    this.currentOverlay.id = 'pocketmontube-overlay';
    this.currentOverlay.className = 'pocketmontube-overlay';
    // 마지막 수집 시간
    const lastUpdate = group.lastVideoUpdate;
    const lastUpdateText = lastUpdate ? this.formatTimeAgo(lastUpdate) : '수집 안됨';

    this.currentOverlay.innerHTML = `
      <div class="pocketmontube-overlay-backdrop"></div>
      <div class="pocketmontube-overlay-container">
        <div class="pocketmontube-overlay-header">
          <div class="pocketmontube-overlay-title-area">
            <span class="pocketmontube-overlay-icon">${group.icon || '📁'}</span>
            <button class="pocketmontube-folder-dropdown-btn" title="다른 폴더로 이동">
              <h2 class="pocketmontube-overlay-title">${this.escapeHtml(group.name)}</h2>
              <span class="pocketmontube-dropdown-arrow">▼</span>
            </button>
            <span class="pocketmontube-video-count">로딩 중...</span>
          </div>
          <div class="pocketmontube-header-actions">
            <span class="pocketmontube-last-update" title="마지막 수집 시간">🕐 ${lastUpdateText}</span>
            <button type="button" class="pocketmontube-refresh-btn" title="그룹 영상 새로고침">
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
            <button class="pocketmontube-overlay-close">✕</button>
          </div>
        </div>
        <div class="pocketmontube-overlay-controls">
          <div class="pocketmontube-control-left">
            <select class="pocketmontube-limit-select">
              <option value="100" ${this.videoLimit === 100 ? 'selected' : ''}>100개</option>
              <option value="300" ${this.videoLimit === 300 ? 'selected' : ''}>300개</option>
              <option value="500" ${this.videoLimit === 500 ? 'selected' : ''}>500개</option>
              <option value="800" ${this.videoLimit === 800 ? 'selected' : ''}>800개</option>
            </select>
            <select class="pocketmontube-viewsource-select" title="데이터 수집 방식">
              <option value="youtube_api">🎬 YouTube API (빠름)</option>
              <option value="returnyoutubedislike">📊 RYD API</option>
              <option value="directfetch">🔍 직접 HTTP (정확)</option>
            </select>
          </div>
          <div class="pocketmontube-control-right">
            <select class="pocketmontube-sort-select">
              <option value="date">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="views">조회수순</option>
              <option value="viral">바이럴순</option>
            </select>
            <select class="pocketmontube-filter-select">
              <option value="all">모든 동영상</option>
              <option value="unwatched">시청하지 않음</option>
              <option value="saved">저장된 영상</option>
              <option value="shorts">Shorts만</option>
              <option value="longform">롱폼만</option>
            </select>
          </div>
        </div>
        <div class="pocketmontube-overlay-content">
          <div class="pocketmontube-loading">
            <div class="pocketmontube-spinner"></div>
            <p>영상 로딩 중...</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.currentOverlay);
    document.body.style.overflow = 'hidden';

    // 이벤트 연결
    this.attachOverlayEvents();

    // 영상 로드
    await this.loadVideos(groupId);
  }

  /**
   * 오버레이 이벤트 연결
   */
  private attachOverlayEvents() {
    if (!this.currentOverlay) return;

    // 닫기 버튼
    this.currentOverlay.querySelector('.pocketmontube-overlay-close')?.addEventListener('click', () => {
      this.closeOverlay();
    });

    // 배경 클릭
    this.currentOverlay.querySelector('.pocketmontube-overlay-backdrop')?.addEventListener('click', () => {
      this.closeOverlay();
    });

    // ESC 키
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeOverlay();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // 정렬 변경
    this.currentOverlay.querySelector('.pocketmontube-sort-select')?.addEventListener('change', (e) => {
      this.sortBy = (e.target as HTMLSelectElement).value as SortOption;
      if (this.currentGroupId) this.loadVideos(this.currentGroupId);
    });

    // 필터 변경
    this.currentOverlay.querySelector('.pocketmontube-filter-select')?.addEventListener('change', (e) => {
      this.filterBy = (e.target as HTMLSelectElement).value as FilterOption;
      if (this.currentGroupId) this.loadVideos(this.currentGroupId);
    });

    // 개수 변경
    this.currentOverlay.querySelector('.pocketmontube-limit-select')?.addEventListener('change', async (e) => {
      const newLimit = parseInt((e.target as HTMLSelectElement).value) as VideoLimitOption;
      console.log('[InPageApp] Limit changed from', this.videoLimit, 'to', newLimit);
      this.videoLimit = newLimit;
      await StorageManager.updateSettings({ maxVideosPerChannel: this.videoLimit });
      console.log('[InPageApp] Settings saved, reloading videos...');
      if (this.currentGroupId) this.loadVideos(this.currentGroupId);
    });

    // 조회수 소스 변경 (dataSource도 함께 업데이트)
    this.currentOverlay.querySelector('.pocketmontube-viewsource-select')?.addEventListener('change', async (e) => {
      const value = (e.target as HTMLSelectElement).value as 'youtube_api' | 'returnyoutubedislike' | 'directfetch';

      if (value === 'youtube_api') {
        // YouTube API 선택 시 dataSource도 youtube_api로 설정
        await StorageManager.updateSettings({
          dataSource: 'youtube_api',
          viewCountSource: 'returnyoutubedislike'  // API 사용 시 viewCountSource는 의미없지만 저장
        });
      } else {
        // 다른 옵션 선택 시 dataSource는 html로, viewCountSource는 선택한 값으로
        await StorageManager.updateSettings({
          dataSource: 'html',
          viewCountSource: value as 'returnyoutubedislike' | 'directfetch'
        });
      }
      console.log('[InPageApp] Data source changed to:', value);
    });

    // 현재 설정된 데이터 소스 로드
    StorageManager.getSettings().then(settings => {
      const select = this.currentOverlay?.querySelector('.pocketmontube-viewsource-select') as HTMLSelectElement;
      if (select) {
        // dataSource가 youtube_api면 youtube_api 선택, 아니면 viewCountSource 값 사용
        if (settings.dataSource === 'youtube_api') {
          select.value = 'youtube_api';
        } else if (settings.viewCountSource) {
          select.value = settings.viewCountSource;
        }
      }
    });

    // 폴더명 클릭 시 다른 폴더로 이동 드롭다운
    this.currentOverlay.querySelector('.pocketmontube-folder-dropdown-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showFolderSwitchDropdown();
    });

    // 새로고침 버튼 - 각 영상 페이지에서 조회수 업데이트
    this.currentOverlay.querySelector('.pocketmontube-refresh-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[InPageApp] Refresh button clicked!');
      if (!this.currentGroupId) {
        console.log('[InPageApp] No currentGroupId');
        return;
      }

      const btn = this.currentOverlay?.querySelector('.pocketmontube-refresh-btn') as HTMLButtonElement;
      const lastUpdateEl = this.currentOverlay?.querySelector('.pocketmontube-last-update');

      // 버튼 비활성화 및 회전 애니메이션
      if (btn) {
        btn.disabled = true;
        btn.classList.add('spinning');
      }

      try {
        if (lastUpdateEl) {
          lastUpdateEl.textContent = '🔄 새 영상 수집 + 조회수 업데이트 중...';
        }

        // 백그라운드에 RSS + API 통합 새로고침 요청
        const response = await chrome.runtime.sendMessage({
          type: 'REFRESH_GROUP_VIDEOS',
          groupId: this.currentGroupId
        });

        console.log('[InPageApp] Refresh response:', response);

        // 그룹 데이터 다시 로드
        this.groups = await StorageManager.getGroups();
        const updatedGroup = this.groups.find(g => g.id === this.currentGroupId);

        if (lastUpdateEl && updatedGroup?.lastVideoUpdate) {
          lastUpdateEl.textContent = `🕐 ${this.formatTimeAgo(updatedGroup.lastVideoUpdate)}`;
        } else if (lastUpdateEl) {
          lastUpdateEl.textContent = `🕐 방금 업데이트`;
        }

        // 영상 다시 로드
        await this.loadVideos(this.currentGroupId);
      } catch (error) {
        console.error('[InPageApp] Refresh failed:', error);
        if (lastUpdateEl) {
          lastUpdateEl.textContent = '❌ 업데이트 실패';
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('spinning');
        }
      }
    });
  }

  /**
   * 영상 로드 및 렌더링
   */
  private async loadVideos(groupId: string) {
    console.log('[InPageApp] loadVideos called for group:', groupId);
    const content = this.currentOverlay?.querySelector('.pocketmontube-overlay-content');
    const countEl = this.currentOverlay?.querySelector('.pocketmontube-video-count');
    if (!content) {
      console.log('[InPageApp] No content element found!');
      return;
    }

    // 스토리지에서 영상 로드
    let videos = await StorageManager.getFilteredVideos(groupId, this.filterBy);
    console.log('[InPageApp] Loaded videos:', videos.length, 'Sample viewCounts:', videos.slice(0, 3).map(v => v.viewCount));

    // 정렬
    switch (this.sortBy) {
      case 'date':
        videos.sort((a, b) => b.uploadedAt - a.uploadedAt);
        break;
      case 'oldest':
        videos.sort((a, b) => a.uploadedAt - b.uploadedAt);
        break;
      case 'views':
        videos.sort((a, b) => b.viewCount - a.viewCount);
        break;
      case 'viral':
        videos.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
        break;
    }

    // 개수 제한
    videos = videos.slice(0, this.videoLimit);

    if (countEl) {
      countEl.textContent = `${videos.length}개 동영상`;
    }

    if (videos.length === 0) {
      content.innerHTML = `
        <div class="pocketmontube-empty">
          <svg viewBox="0 0 24 24" width="64" height="64"><path fill="currentColor" d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
          <p>영상이 없습니다</p>
          <p class="pocketmontube-empty-hint">채널을 추가하고 영상을 수집해주세요</p>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="pocketmontube-video-grid">
        ${videos.map(video => this.renderVideoCard(video)).join('')}
      </div>
    `;

    // 영상 클릭 이벤트 (썸네일 클릭 시 영상 열기)
    content.querySelectorAll('.pocketmontube-thumb-container').forEach(thumb => {
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = (thumb as HTMLElement).closest('.pocketmontube-video-card') as HTMLElement;
        const videoId = card?.dataset.videoId!;
        const video = videos.find(v => v.id === videoId);
        if (video) {
          console.log('[InPageApp] Opening video:', video.id, 'URL:', video.url);
          StorageManager.markVideoAsWatched(videoId, true);
          window.open(video.url, '_blank');
          card.classList.add('watched');
        } else {
          console.log('[InPageApp] Video not found for id:', videoId);
        }
      });
    });

    // 강제 업데이트 버튼
    content.querySelectorAll('.pocketmontube-force-update-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const videoId = (btn as HTMLElement).dataset.videoId!;
        const video = videos.find(v => v.id === videoId);
        if (!video || !this.currentGroupId) return;

        (btn as HTMLButtonElement).disabled = true;
        (btn as HTMLElement).textContent = '⏳';

        try {
          // 백그라운드에 직접 fetch 요청
          const response = await chrome.runtime.sendMessage({
            type: 'FORCE_UPDATE_VIDEO',
            videoId,
            groupId: this.currentGroupId,
            isShorts: video.isShorts
          });

          if (response?.success) {
            console.log('[InPageApp] Force update success:', response);
            // 그룹 다시 로드
            this.groups = await StorageManager.getGroups();
            await this.loadVideos(this.currentGroupId);
          } else {
            alert('업데이트 실패: ' + (response?.error || 'Unknown error'));
          }
        } catch (err) {
          console.error('[InPageApp] Force update failed:', err);
        } finally {
          (btn as HTMLButtonElement).disabled = false;
          (btn as HTMLElement).textContent = '🔄';
        }
      });
    });

    // 폴더 이동 버튼
    content.querySelectorAll('.pocketmontube-move-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoId = (btn as HTMLElement).dataset.videoId!;
        const video = videos.find(v => v.id === videoId);
        if (!video) return;

        this.showMoveToFolderModal(video);
      });
    });

    // 다운로드 버튼
    content.querySelectorAll('.pocketmontube-download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoId = (btn as HTMLElement).dataset.videoId!;
        const video = videos.find(v => v.id === videoId);
        if (!video) return;

        this.showDownloadMenu(btn as HTMLElement, video);
      });
    });
  }

  /**
   * 폴더 전환 드롭다운 표시 (헤더의 폴더명 클릭 시)
   */
  private showFolderSwitchDropdown() {
    // 기존 드롭다운 제거
    document.querySelectorAll('.pocketmontube-folder-switch-dropdown').forEach(d => d.remove());

    if (this.groups.length <= 1) {
      alert('다른 폴더가 없습니다.');
      return;
    }

    const btn = this.currentOverlay?.querySelector('.pocketmontube-folder-dropdown-btn');
    if (!btn) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'pocketmontube-folder-switch-dropdown';
    dropdown.innerHTML = `
      ${this.groups.map(g => `
        <button class="pocketmontube-folder-switch-item ${g.id === this.currentGroupId ? 'active' : ''}" data-group-id="${g.id}">
          <span class="pocketmontube-folder-switch-icon">${g.icon || '📁'}</span>
          <span class="pocketmontube-folder-switch-name">${this.escapeHtml(g.name)}</span>
          <span class="pocketmontube-folder-switch-count">${(g.videos || []).length}개</span>
        </button>
      `).join('')}
    `;

    // 위치 설정
    const rect = btn.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.zIndex = '10001';

    document.body.appendChild(dropdown);

    // 폴더 선택 이벤트
    dropdown.querySelectorAll('.pocketmontube-folder-switch-item').forEach(item => {
      item.addEventListener('click', async () => {
        const groupId = (item as HTMLElement).dataset.groupId!;
        if (groupId === this.currentGroupId) {
          dropdown.remove();
          return;
        }

        // 폴더 전환
        this.currentGroupId = groupId;
        const selectedGroup = this.groups.find(g => g.id === groupId);
        if (selectedGroup) {
          // 헤더 업데이트
          const iconEl = this.currentOverlay?.querySelector('.pocketmontube-overlay-icon');
          const titleEl = this.currentOverlay?.querySelector('.pocketmontube-overlay-title');
          if (iconEl) iconEl.textContent = selectedGroup.icon || '📁';
          if (titleEl) titleEl.textContent = selectedGroup.name;

          // 영상 로드
          await this.loadVideos(groupId);
        }
        dropdown.remove();
      });
    });

    // 외부 클릭 시 닫기
    setTimeout(() => {
      document.addEventListener('click', function closeDropdown(e) {
        if (!dropdown.contains(e.target as Node)) {
          dropdown.remove();
          document.removeEventListener('click', closeDropdown);
        }
      });
    }, 0);
  }

  /**
   * 영상 카드 렌더링
   */
  private renderVideoCard(video: Video): string {
    const isShorts = video.isShorts || video.duration === 'Shorts';

    return `
      <div class="pocketmontube-video-card ${video.watched ? 'watched' : ''}" data-video-id="${video.id}">
        <div class="pocketmontube-thumb-container">
          <img class="pocketmontube-thumb" src="${video.thumbnail}" alt="" loading="lazy">
          ${isShorts
        ? `<span class="pocketmontube-shorts-badge">Shorts</span><span class="pocketmontube-duration">${video.duration && video.duration !== 'Shorts' ? video.duration : ''}</span>`
        : `<span class="pocketmontube-duration">${video.duration}</span>`
      }
          ${video.viralScore && video.viralScore > 50
        ? `<span class="pocketmontube-viral-badge">🔥 ${this.formatNumber(video.viralScore)}/h</span>`
        : ''
      }
          ${video.watched ? '<div class="pocketmontube-watched-overlay"><span>✓</span></div>' : ''}
        </div>
        <div class="pocketmontube-video-info">
          <div class="pocketmontube-title-row">
            <h3 class="pocketmontube-video-title" title="${this.escapeHtml(video.title)}">${this.escapeHtml(video.title)}</h3>
            <div class="pocketmontube-video-actions">
              <button class="pocketmontube-download-btn" data-video-id="${video.id}" title="다운로드">⬇</button>
              <button class="pocketmontube-force-update-btn" data-video-id="${video.id}" title="강제 업데이트 (조회수/날짜)">🔄</button>
              <button class="pocketmontube-move-btn" data-video-id="${video.id}" title="다른 폴더로 복사">📂</button>
            </div>
          </div>
          <a href="https://www.youtube.com/channel/${video.channelId}/videos" target="_blank" class="pocketmontube-channel" onclick="event.stopPropagation()">${this.escapeHtml(video.channelName)}</a>
          <p class="pocketmontube-meta">
            조회수 ${this.formatNumber(video.viewCount)}회 · ${this.formatTimeAgo(video.uploadedAt)}
            ${video.viralScore ? ` · 🔥${this.formatNumber(video.viralScore)}/h` : ''}
          </p>
        </div>
      </div>
    `;
  }

  /**
   * 다운로드 메뉴 표시
   */
  private showDownloadMenu(btn: HTMLElement, video: Video) {
    // 기존 메뉴 제거
    document.querySelectorAll('.pocketmontube-download-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'pocketmontube-download-menu';
    menu.innerHTML = `
      <button class="pocketmontube-download-menu-item" data-action="video">
        🎬 영상 다운로드
      </button>
      <button class="pocketmontube-download-menu-item" data-action="audio">
        🎵 MP3 추출
      </button>
      <button class="pocketmontube-download-menu-item" data-action="subs">
        📝 자막 추출
      </button>
    `;

    // 위치 설정
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left - 100}px`;
    menu.style.zIndex = '10002';

    document.body.appendChild(menu);

    // 메뉴 아이템 클릭
    menu.querySelectorAll('.pocketmontube-download-menu-item').forEach(item => {
      item.addEventListener('click', async () => {
        const action = (item as HTMLElement).dataset.action;

        // Service Worker를 통해 다운로드 요청 (HTTPS 혼합 콘텐츠 우회)
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'DOWNLOAD_VIDEO',
            videoId: video.id,
            mode: action
          });

          if (response && response.success) {
            const openFiles = confirm(
              `✅ 다운로드 시작!\n\n${response.message}\n\n파일 목록 페이지를 열까요? (다운로드 완료 후 파일 받기)`
            );
            if (openFiles && response.filesUrl) {
              window.open(response.filesUrl, '_blank');
            }
          } else if (response && response.error) {
            throw new Error(response.error);
          } else {
            throw new Error('서버 응답 없음');
          }
        } catch (error) {
          // 서버가 안 돌아가면 명령어 복사 폴백
          const videoUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
          let cmd = '';
          if (action === 'video') {
            cmd = `yt-dlp "${videoUrl}"`;
          } else if (action === 'audio') {
            cmd = `yt-dlp -x --audio-format mp3 "${videoUrl}"`;
          } else if (action === 'subs') {
            cmd = `yt-dlp --write-auto-sub --sub-lang ko --convert-subs=srt --skip-download "${videoUrl}"`;
          }

          navigator.clipboard.writeText(cmd).then(() => {
            alert(`⚠️ 다운로드 서버 연결 실패\n\n명령어가 복사되었습니다:\n${cmd}`);
          }).catch(() => {
            prompt('다운로드 서버에 연결할 수 없습니다.\n아래 명령어를 복사하세요:', cmd);
          });
        }

        menu.remove();
      });
    });

    // 외부 클릭 시 닫기
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target as Node)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
  }

  /**
   * 폴더 이동 모달 표시
   */
  private async showMoveToFolderModal(video: Video) {
    // 기존 모달 제거
    document.querySelectorAll('.pocketmontube-move-modal').forEach(m => m.remove());

    const otherGroups = this.groups.filter(g => g.id !== this.currentGroupId);
    if (otherGroups.length === 0) {
      alert('다른 폴더가 없습니다.');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'pocketmontube-move-modal';
    modal.innerHTML = `
      <div class="pocketmontube-move-modal-backdrop"></div>
      <div class="pocketmontube-move-modal-content">
        <div class="pocketmontube-move-modal-header">
          <span>📂 폴더로 복사</span>
          <button class="pocketmontube-move-modal-close">✕</button>
        </div>
        <div class="pocketmontube-move-modal-body">
          <p class="pocketmontube-move-video-title">${this.escapeHtml(video.title)}</p>
          <div class="pocketmontube-move-modal-groups">
            ${otherGroups.map(g => `
              <button class="pocketmontube-move-modal-group-btn" data-group-id="${g.id}">
                <span>${g.icon || '📁'}</span>
                <span>${this.escapeHtml(g.name)}</span>
                <span style="color: #888; font-size: 12px;">${(g.videos || []).length}개</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 닫기 버튼
    modal.querySelector('.pocketmontube-move-modal-close')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.pocketmontube-move-modal-backdrop')?.addEventListener('click', () => modal.remove());

    // 폴더 선택
    modal.querySelectorAll('.pocketmontube-move-modal-group-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetGroupId = (btn as HTMLElement).dataset.groupId!;

        // 영상 복사
        const videoCopy = { ...video, groupId: targetGroupId };
        await StorageManager.addVideosToGroup(targetGroupId, [videoCopy]);

        modal.remove();
        alert(`"${this.groups.find(g => g.id === targetGroupId)?.name}" 폴더로 복사되었습니다!`);
      });
    });
  }

  /**
   * 오버레이 닫기
   */
  closeOverlay() {
    if (this.currentOverlay) {
      this.currentOverlay.remove();
      this.currentOverlay = null;
    }
    document.body.style.overflow = '';
    this.currentGroupId = null;
  }

  // 유틸리티 함수들
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private formatNumber(count: number): string {
    if (count >= 100000000) return `${(count / 100000000).toFixed(1)}억`;
    if (count >= 10000) return `${(count / 10000).toFixed(1)}만`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}천`;
    return `${count}`;
  }

  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;

    if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
    if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
    if (diff < week) return `${Math.floor(diff / day)}일 전`;
    if (diff < month) return `${Math.floor(diff / week)}주 전`;
    return `${Math.floor(diff / month)}개월 전`;
  }
}

// 전역 인스턴스
export const inPageApp = new InPageApp();
