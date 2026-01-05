import { StorageManager } from '../utils/storage';
import type { Video, Group, SortOption, FilterOption } from '../types';

/**
 * YouTube 내부에 오버레이 팝업으로 그룹 영상 표시
 */
export class VideoPopup {
  private overlay: HTMLElement | null = null;
  private group: Group | null = null;
  private videos: Video[] = [];
  private sortBy: SortOption = 'date';
  private filterBy: FilterOption = 'all';

  /**
   * 팝업 표시
   */
  async show(groupId: string) {
    // 그룹 로드
    this.group = await StorageManager.getGroup(groupId) || null;
    if (!this.group) {
      console.error('[VideoPopup] Group not found:', groupId);
      return;
    }

    // 기존 팝업 제거
    this.close();

    // 오버레이 생성
    this.createOverlay();

    // 영상 로드 및 렌더링
    await this.loadVideos();
    this.renderContent();
  }

  /**
   * 팝업 닫기
   */
  close() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    document.body.style.overflow = '';
  }

  /**
   * 오버레이 생성
   */
  private createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'mytube-video-popup';
    this.overlay.className = 'mytube-popup-overlay';

    this.overlay.innerHTML = `
      <div class="mytube-popup-backdrop"></div>
      <div class="mytube-popup-container">
        <div class="mytube-popup-header">
          <div class="mytube-popup-title-area">
            <span class="mytube-popup-icon">${this.group?.icon || '📁'}</span>
            <h2 class="mytube-popup-title">${this.escapeHtml(this.group?.name || '')}</h2>
          </div>
          <button class="mytube-popup-close" title="닫기">✕</button>
        </div>
        <div class="mytube-popup-controls">
          <div class="mytube-control-left">
            <span class="mytube-video-count">로딩 중...</span>
            <button class="mytube-collect-btn">
              <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
              영상 수집
            </button>
          </div>
          <div class="mytube-control-right">
            <select class="mytube-sort-select">
              <option value="date">최신순</option>
              <option value="views">조회수순</option>
            </select>
            <div class="mytube-filter-btns">
              <button class="mytube-filter-btn active" data-filter="all">모든 동영상</button>
              <button class="mytube-filter-btn" data-filter="unwatched">시청하지 않음</button>
            </div>
          </div>
        </div>
        <div class="mytube-popup-content">
          <div class="mytube-loading">
            <div class="mytube-spinner"></div>
          </div>
        </div>
      </div>
    `;

    // 스타일 추가
    this.injectStyles();

    // 이벤트 리스너
    this.attachEventListeners();

    // DOM에 추가
    document.body.appendChild(this.overlay);
    document.body.style.overflow = 'hidden';
  }

  /**
   * 영상 로드
   */
  private async loadVideos() {
    if (!this.group) return;

    let videos = await StorageManager.getFilteredVideos(this.group.id, this.filterBy);

    // 정렬
    if (this.sortBy === 'date') {
      videos.sort((a, b) => b.uploadedAt - a.uploadedAt);
    } else if (this.sortBy === 'views') {
      videos.sort((a, b) => b.viewCount - a.viewCount);
    }

    this.videos = videos;
  }

  /**
   * 컨텐츠 렌더링
   */
  private renderContent() {
    const content = this.overlay?.querySelector('.mytube-popup-content');
    const countEl = this.overlay?.querySelector('.mytube-video-count');

    if (!content) return;

    if (countEl) {
      countEl.textContent = `${this.videos.length}개 동영상`;
    }

    if (this.videos.length === 0) {
      content.innerHTML = `
        <div class="mytube-empty-state">
          <svg viewBox="0 0 24 24" width="64" height="64"><path fill="currentColor" d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
          <p>영상이 없습니다</p>
          <p class="mytube-empty-hint">"영상 수집" 버튼을 눌러 채널에서 영상을 가져오세요</p>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="mytube-video-grid">
        ${this.videos.map(video => this.renderVideoCard(video)).join('')}
      </div>
    `;

    // 영상 클릭 이벤트
    content.querySelectorAll('.mytube-video-card').forEach(card => {
      card.addEventListener('click', () => {
        const videoId = (card as HTMLElement).dataset.videoId!;
        const video = this.videos.find(v => v.id === videoId);
        if (video) {
          StorageManager.markVideoAsWatched(videoId, true);
          window.open(video.url, '_blank');
          // 카드 시청 상태 업데이트
          card.classList.add('watched');
        }
      });
    });
  }

  /**
   * 영상 카드 렌더링
   */
  private renderVideoCard(video: Video): string {
    const isShorts = video.duration === '0:00' || video.url?.includes('/shorts/');

    return `
      <div class="mytube-video-card ${video.watched ? 'watched' : ''}" data-video-id="${video.id}">
        <div class="mytube-thumbnail-container">
          <img class="mytube-thumbnail" src="${video.thumbnail}" alt="" loading="lazy">
          ${isShorts ? `
            <span class="mytube-shorts-badge">
              <svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M10.65,1c-0.37,0-0.75,0.1-1.09,0.31L4.25,4.46C3.44,4.93,2.96,5.89,3,6.9C3.05,7.9,3.58,8.77,4.39,9.18l-0.9,0.53c-1.14,0.68-1.58,2.27-0.98,3.55C3.69,14.49,4.5,15,5.35,15c0.37,0,0.74-0.1,1.09-0.31l5.31-3.15c0.8-0.48,1.29-1.43,1.24-2.45c-0.04-0.99-0.58-1.87-1.39-2.27l0.9-0.53c1.14-0.68,1.58-2.27,0.97-3.55C12.31,1.51,11.49,1,10.65,1z"/></svg>
            </span>
          ` : `<span class="mytube-duration">${video.duration}</span>`}
          ${video.watched ? '<div class="mytube-watched-overlay"><span>✓</span></div>' : ''}
        </div>
        <div class="mytube-video-info">
          <h3 class="mytube-video-title" title="${this.escapeHtml(video.title)}">${this.escapeHtml(video.title)}</h3>
          <p class="mytube-channel-name">${this.escapeHtml(video.channelName || 'Unknown')}</p>
          <p class="mytube-video-meta">
            조회수 ${this.formatViewCount(video.viewCount)}회 • ${this.formatTimeAgo(video.uploadedAt)}
          </p>
        </div>
      </div>
    `;
  }

  /**
   * 이벤트 리스너 연결
   */
  private attachEventListeners() {
    if (!this.overlay) return;

    // 닫기 버튼
    this.overlay.querySelector('.mytube-popup-close')?.addEventListener('click', () => {
      this.close();
    });

    // 배경 클릭으로 닫기
    this.overlay.querySelector('.mytube-popup-backdrop')?.addEventListener('click', () => {
      this.close();
    });

    // ESC 키로 닫기
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // 정렬 변경
    this.overlay.querySelector('.mytube-sort-select')?.addEventListener('change', async (e) => {
      this.sortBy = (e.target as HTMLSelectElement).value as SortOption;
      await this.loadVideos();
      this.renderContent();
    });

    // 필터 버튼
    this.overlay.querySelectorAll('.mytube-filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.overlay?.querySelectorAll('.mytube-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterBy = (btn as HTMLElement).dataset.filter as FilterOption;
        await this.loadVideos();
        this.renderContent();
      });
    });

    // 영상 수집
    this.overlay.querySelector('.mytube-collect-btn')?.addEventListener('click', async () => {
      const btn = this.overlay?.querySelector('.mytube-collect-btn') as HTMLButtonElement;
      if (!btn || !this.group) return;

      btn.disabled = true;
      btn.innerHTML = '<span class="mytube-spinner-small"></span> 수집 중...';

      try {
        await chrome.runtime.sendMessage({ type: 'COLLECT_GROUP_VIDEOS', groupId: this.group.id });
        // 잠시 대기 후 다시 로드
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.loadVideos();
        this.renderContent();
      } catch (error) {
        console.error('[VideoPopup] Collect error:', error);
      }

      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
        영상 수집
      `;
    });
  }

  /**
   * 스타일 주입
   */
  private injectStyles() {
    if (document.getElementById('mytube-popup-styles')) return;

    const style = document.createElement('style');
    style.id = 'mytube-popup-styles';
    style.textContent = `
      .mytube-popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .mytube-popup-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
      }
      .mytube-popup-container {
        position: relative;
        width: 90%;
        max-width: 1200px;
        max-height: 85vh;
        background: #fff;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      }
      .mytube-popup-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e5e5;
        background: #f9f9f9;
      }
      .mytube-popup-title-area {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .mytube-popup-icon {
        font-size: 28px;
      }
      .mytube-popup-title {
        font-size: 20px;
        font-weight: 600;
        color: #0f0f0f;
        margin: 0;
      }
      .mytube-popup-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        color: #606060;
        transition: background 0.2s;
      }
      .mytube-popup-close:hover {
        background: #e5e5e5;
      }
      .mytube-popup-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        border-bottom: 1px solid #e5e5e5;
        flex-wrap: wrap;
        gap: 12px;
      }
      .mytube-control-left, .mytube-control-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .mytube-video-count {
        font-size: 14px;
        color: #606060;
      }
      .mytube-collect-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: #ff0000;
        color: white;
        border: none;
        border-radius: 18px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }
      .mytube-collect-btn:hover:not(:disabled) {
        background: #cc0000;
      }
      .mytube-collect-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
      .mytube-sort-select {
        padding: 8px 12px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
      }
      .mytube-filter-btns {
        display: flex;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #065fd4;
      }
      .mytube-filter-btn {
        padding: 8px 16px;
        border: none;
        background: white;
        color: #065fd4;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .mytube-filter-btn.active {
        background: #065fd4;
        color: white;
      }
      .mytube-filter-btn:hover:not(.active) {
        background: #e8f0fe;
      }
      .mytube-popup-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      .mytube-video-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
      }
      .mytube-video-card {
        cursor: pointer;
        border-radius: 8px;
        overflow: hidden;
        transition: transform 0.2s;
      }
      .mytube-video-card:hover {
        transform: translateY(-4px);
      }
      .mytube-video-card.watched .mytube-video-title {
        color: #606060;
      }
      .mytube-thumbnail-container {
        position: relative;
        aspect-ratio: 16/9;
        background: #f0f0f0;
        border-radius: 8px;
        overflow: hidden;
      }
      .mytube-thumbnail {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .mytube-duration {
        position: absolute;
        bottom: 4px;
        right: 4px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
      }
      .mytube-shorts-badge {
        position: absolute;
        top: 8px;
        left: 8px;
        background: #ff0000;
        color: white;
        padding: 4px 6px;
        border-radius: 4px;
        display: flex;
        align-items: center;
      }
      .mytube-watched-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .mytube-video-card:hover .mytube-watched-overlay {
        opacity: 1;
      }
      .mytube-watched-overlay span {
        background: rgba(0,0,0,0.7);
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
      }
      .mytube-video-info {
        padding: 8px 0;
      }
      .mytube-video-title {
        font-size: 14px;
        font-weight: 500;
        color: #0f0f0f;
        margin: 0 0 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.4;
      }
      .mytube-channel-name {
        font-size: 12px;
        color: #606060;
        margin: 0 0 2px;
      }
      .mytube-video-meta {
        font-size: 12px;
        color: #606060;
        margin: 0;
      }
      .mytube-loading, .mytube-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        color: #606060;
      }
      .mytube-empty-state svg {
        opacity: 0.5;
        margin-bottom: 16px;
      }
      .mytube-empty-state p {
        margin: 0;
        font-size: 16px;
      }
      .mytube-empty-hint {
        font-size: 14px !important;
        color: #909090 !important;
        margin-top: 8px !important;
      }
      .mytube-spinner, .mytube-spinner-small {
        border: 3px solid #e5e5e5;
        border-top-color: #ff0000;
        border-radius: 50%;
        animation: mytube-spin 1s linear infinite;
      }
      .mytube-spinner {
        width: 40px;
        height: 40px;
      }
      .mytube-spinner-small {
        width: 16px;
        height: 16px;
        border-width: 2px;
        display: inline-block;
      }
      @keyframes mytube-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * HTML 이스케이프
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 조회수 포맷
   */
  private formatViewCount(count: number): string {
    if (count >= 100000000) return `${(count / 100000000).toFixed(1)}억`;
    if (count >= 10000) return `${(count / 10000).toFixed(1)}만`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}천`;
    return `${count}`;
  }

  /**
   * 시간 포맷
   */
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
export const videoPopup = new VideoPopup();
