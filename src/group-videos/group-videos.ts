import { StorageManager } from '../utils/storage';
import type { Video, Group } from '../types';

type SortOption = 'date' | 'oldest' | 'views' | 'viral';
type FilterOption = 'all' | 'unwatched';

/**
 * 그룹 영상 페이지 스크립트
 * YouTube 스타일로 그룹 영상을 크게 표시
 */
class GroupVideosPage {
  private groupId: string = '';
  private group: Group | null = null;
  private videos: Video[] = [];
  private sortBy: SortOption = 'date';
  private filterBy: FilterOption = 'all';

  async init() {
    // URL에서 groupId 파싱
    const params = new URLSearchParams(window.location.search);
    this.groupId = params.get('groupId') || '';

    if (!this.groupId) {
      this.showError('그룹 ID가 없습니다.');
      return;
    }

    // 그룹 로드
    this.group = await StorageManager.getGroup(this.groupId) || null;
    if (!this.group) {
      this.showError('그룹을 찾을 수 없습니다.');
      return;
    }

    // UI 업데이트
    this.updateHeader();
    await this.loadVideos();
    this.setupEventListeners();
    this.hideLoading();
  }

  private updateHeader() {
    if (!this.group) return;

    document.getElementById('group-icon')!.textContent = this.group.icon || '📁';
    document.getElementById('group-name')!.textContent = this.group.name;
    document.title = `${this.group.name} - MyTube`;
  }

  private async loadVideos() {
    if (!this.groupId) return;

    let videos = await StorageManager.getFilteredVideos(this.groupId, this.filterBy);

    // 정렬
    if (this.sortBy === 'date') {
      videos.sort((a, b) => b.uploadedAt - a.uploadedAt);
    } else if (this.sortBy === 'oldest') {
      videos.sort((a, b) => a.uploadedAt - b.uploadedAt);
    } else if (this.sortBy === 'views') {
      videos.sort((a, b) => b.viewCount - a.viewCount);
    } else if (this.sortBy === 'viral') {
      videos.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
    }

    this.videos = videos;
    this.renderVideos();
  }

  private renderVideos() {
    const grid = document.getElementById('video-grid')!;
    const emptyState = document.getElementById('empty-state')!;

    document.getElementById('video-count')!.textContent = `${this.videos.length}개 동영상`;

    if (this.videos.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    grid.innerHTML = this.videos.map(video => this.renderVideoCard(video)).join('');

    // 클릭 이벤트 추가
    grid.querySelectorAll('.video-card').forEach(card => {
      card.addEventListener('click', () => {
        const videoId = (card as HTMLElement).dataset.videoId!;
        const video = this.videos.find(v => v.id === videoId);
        if (video) {
          StorageManager.markVideoAsWatched(videoId, true);
          window.open(video.url, '_blank');
        }
      });
    });

    // 이미지 로드 실패 시 숨김 (CSP 준수)
    grid.querySelectorAll('img').forEach(img => {
      img.addEventListener('error', () => {
        (img as HTMLElement).style.display = 'none';
      });
    });
  }

  private renderVideoCard(video: Video): string {
    const isShorts = video.isShorts || video.duration === 'Shorts' || video.url?.includes('/shorts/');

    return `
      <div class="video-card ${video.watched ? 'watched' : ''}" data-video-id="${video.id}">
        <div class="thumbnail-container">
          <img src="${video.thumbnail}" alt="${this.escapeHtml(video.title)}" loading="lazy">
          ${isShorts
        ? `<span class="shorts-badge">Shorts</span>`
        : `<span class="duration">${video.duration}</span>`
      }
          ${video.viralScore && video.viralScore > 100 ? `<span class="viral-badge">🔥 ${this.formatViralScore(video.viralScore)}</span>` : ''}
          ${video.watched ? `
            <div class="watched-overlay">
              <span>✓</span>
            </div>
          ` : ''}
        </div>
        <h3 class="video-title">${this.escapeHtml(video.title)}</h3>
        <p class="channel-name">${this.escapeHtml(video.channelName || 'Unknown Channel')}</p>
        <p class="video-meta">
          조회수 ${this.formatViewCount(video.viewCount)}회 • ${this.formatTimeAgo(video.uploadedAt)}
          ${video.viralScore ? ` • 🔥${this.formatViralScore(video.viralScore)}/h` : ''}
        </p>
      </div>
    `;
  }

  private setupEventListeners() {
    // 정렬 변경
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.sortBy = (e.target as HTMLSelectElement).value as SortOption;
      this.loadVideos();
    });

    // 필터 변경
    document.getElementById('filter-select')?.addEventListener('change', (e) => {
      this.filterBy = (e.target as HTMLSelectElement).value as FilterOption;
      this.loadVideos();
    });

    // 새로고침 (저장된 데이터만 다시 로드)
    document.getElementById('refresh-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('refresh-btn')!;
      btn.setAttribute('disabled', 'true');
      btn.innerHTML = `
        <svg class="animate-spin" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="31.416" stroke-dashoffset="10"/>
        </svg>
        새로고침 중...
      `;

      // 그룹 다시 로드
      this.group = await StorageManager.getGroup(this.groupId) || null;
      await this.loadVideos();

      btn.removeAttribute('disabled');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        새로고침
      `;
    });

    // 채널 드롭다운 토글
    document.getElementById('channels-btn')?.addEventListener('click', () => {
      const list = document.getElementById('channels-list')!;
      list.classList.toggle('hidden');
      this.renderChannelsList();
    });

    // 드롭다운 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
      const dropdown = document.querySelector('.channels-dropdown');
      if (dropdown && !dropdown.contains(e.target as Node)) {
        document.getElementById('channels-list')?.classList.add('hidden');
      }
    });
  }

  private renderChannelsList() {
    const list = document.getElementById('channels-list')!;
    if (!this.group || !this.group.channels || this.group.channels.length === 0) {
      list.innerHTML = '<div class="channel-item no-channels">채널이 없습니다</div>';
      return;
    }

    list.innerHTML = this.group.channels.map(channel => {
      const url = channel.handle
        ? `https://www.youtube.com/${channel.handle}/videos`
        : `https://www.youtube.com/channel/${channel.id}/videos`;
      return `
        <a href="${url}" target="_blank" class="channel-item">
          ${channel.thumbnail ? `<img src="${channel.thumbnail}" alt="">` : '<span class="channel-icon">📺</span>'}
          <span class="channel-name">${this.escapeHtml(channel.name)}</span>
          <span class="visit-icon">↗</span>
        </a>
      `;
    }).join('');
  }

  private hideLoading() {
    document.getElementById('loading-state')?.classList.add('hidden');
  }

  private showError(message: string) {
    document.getElementById('loading-state')!.innerHTML = `
  < p class="text-red-500" > ${message} </p>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private formatViewCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)} M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)} K`;
    return `${count} `;
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

  private formatViralScore(score: number): string {
    if (score >= 1000000) return `${(score / 1000000).toFixed(1)} M`;
    if (score >= 1000) return `${(score / 1000).toFixed(1)} K`;
    return `${score} `;
  }
}

// 페이지 로드 시 초기화
const page = new GroupVideosPage();
page.init();
