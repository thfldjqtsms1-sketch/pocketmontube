import { StorageManager } from '../utils/storage';
import type { Video, SortOption, FilterOption } from '../types';

/**
 * 영상 그리드 렌더러
 * YouTube 스타일의 영상 그리드 UI
 */
export class VideoGridRenderer {
  private currentGroupId: string | null = null;
  private videos: Video[] = [];
  private sortBy: SortOption = 'date';
  private filterBy: FilterOption = 'all';
  private container: HTMLElement | null = null;

  /**
   * 영상 그리드 렌더링
   */
  async render(groupId: string, parentElement: HTMLElement) {
    this.currentGroupId = groupId;
    await this.loadVideos();

    // 기존 그리드 제거
    const existing = document.querySelector('#mytube-video-grid');
    if (existing) {
      existing.remove();
    }

    // 그리드 컨테이너 생성
    this.container = document.createElement('div');
    this.container.id = 'mytube-video-grid';
    this.container.className = 'mytube-grid-container';

    // 헤더 (필터/정렬 UI)
    const header = this.createHeader();
    this.container.appendChild(header);

    // 영상 그리드
    const grid = this.createGrid();
    this.container.appendChild(grid);

    // 부모 엘리먼트에 추가
    parentElement.appendChild(this.container);
  }

  /**
   * 영상 로드 및 필터링/정렬
   */
  private async loadVideos() {
    if (!this.currentGroupId) return;

    let videos = await StorageManager.getFilteredVideos(this.currentGroupId, this.filterBy);

    // 정렬
    if (this.sortBy === 'date') {
      videos.sort((a, b) => b.uploadedAt - a.uploadedAt);
    } else if (this.sortBy === 'views') {
      videos.sort((a, b) => b.viewCount - a.viewCount);
    }

    this.videos = videos;
  }

  /**
   * 헤더 생성 (필터/정렬 UI)
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'mytube-grid-header';

    const groupName = '그룹 영상'; // TODO: 그룹 이름 가져오기

    header.innerHTML = `
      <div class="mytube-header-left">
        <h2 class="mytube-grid-title">${this.escapeHtml(groupName)}</h2>
        <span class="mytube-video-count">${this.videos.length}개 동영상</span>
      </div>
      <div class="mytube-header-right">
        <div class="mytube-filter-group">
          <label>필터:</label>
          <select class="mytube-filter-select" data-control="filter">
            <option value="all" ${this.filterBy === 'all' ? 'selected' : ''}>모든 동영상</option>
            <option value="unwatched" ${this.filterBy === 'unwatched' ? 'selected' : ''}>시청하지 않음</option>
          </select>
        </div>
        <div class="mytube-sort-group">
          <label>정렬:</label>
          <select class="mytube-sort-select" data-control="sort">
            <option value="date" ${this.sortBy === 'date' ? 'selected' : ''}>최신순</option>
            <option value="views" ${this.sortBy === 'views' ? 'selected' : ''}>조회수순</option>
          </select>
        </div>
      </div>
    `;

    // 이벤트 리스너
    header.querySelector('[data-control="filter"]')?.addEventListener('change', (e) => {
      this.filterBy = (e.target as HTMLSelectElement).value as FilterOption;
      this.reload();
    });

    header.querySelector('[data-control="sort"]')?.addEventListener('change', (e) => {
      this.sortBy = (e.target as HTMLSelectElement).value as SortOption;
      this.reload();
    });

    return header;
  }

  /**
   * 영상 그리드 생성
   */
  private createGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'mytube-video-grid';

    if (this.videos.length === 0) {
      grid.innerHTML = `
        <div class="mytube-empty-state">
          <svg class="mytube-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p class="mytube-empty-text">아직 영상이 없습니다</p>
          <p class="mytube-empty-hint">채널을 추가하고 영상을 수집해보세요!</p>
        </div>
      `;
      return grid;
    }

    this.videos.forEach(video => {
      const videoCard = this.createVideoCard(video);
      grid.appendChild(videoCard);
    });

    return grid;
  }

  /**
   * 개별 영상 카드 생성
   */
  private createVideoCard(video: Video): HTMLElement {
    const card = document.createElement('a');
    card.className = 'mytube-video-card';
    card.href = video.url;
    card.target = '_blank';
    card.dataset.videoId = video.id;

    const isWatched = video.watched;

    card.innerHTML = `
      <div class="mytube-video-thumbnail">
        <img src="${video.thumbnail}" alt="${this.escapeHtml(video.title)}" loading="lazy">
        <span class="mytube-video-duration">${video.duration}</span>
        ${isWatched ? '<div class="mytube-watched-overlay"><svg class="mytube-check-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>' : ''}
      </div>
      <div class="mytube-video-info">
        <h3 class="mytube-video-title">${this.escapeHtml(video.title)}</h3>
        <div class="mytube-video-meta">
          <span class="mytube-video-channel">${this.escapeHtml(video.channelName)}</span>
          <span class="mytube-video-stats">
            ${this.formatViewCount(video.viewCount)} • ${this.formatTimeAgo(video.uploadedAt)}
          </span>
        </div>
      </div>
    `;

    // 시청 마크 토글
    card.addEventListener('click', async () => {
      // 링크는 새 탭에서 열리게 하되, 시청 상태는 업데이트
      await StorageManager.markVideoAsWatched(video.id, true);
    });

    return card;
  }

  /**
   * 조회수 포맷팅
   */
  private formatViewCount(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M회`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K회`;
    }
    return `${count}회`;
  }

  /**
   * 시간 포맷팅
   */
  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    if (diff < hour) {
      return `${Math.floor(diff / minute)}분 전`;
    }
    if (diff < day) {
      return `${Math.floor(diff / hour)}시간 전`;
    }
    if (diff < week) {
      return `${Math.floor(diff / day)}일 전`;
    }
    if (diff < month) {
      return `${Math.floor(diff / week)}주 전`;
    }
    if (diff < year) {
      return `${Math.floor(diff / month)}개월 전`;
    }
    return `${Math.floor(diff / year)}년 전`;
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
   * 리로드
   */
  private async reload() {
    if (!this.container || !this.currentGroupId) return;

    await this.loadVideos();

    // 헤더와 그리드만 다시 렌더링
    this.container.innerHTML = '';
    this.container.appendChild(this.createHeader());
    this.container.appendChild(this.createGrid());
  }
}
