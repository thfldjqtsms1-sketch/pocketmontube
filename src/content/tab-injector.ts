import { StorageManager } from '../utils/storage';
import type { Group } from '../types';
import { VideoGridRenderer } from './video-grid-renderer';

/**
 * YouTube 페이지에 "내 그룹" 탭을 추가하는 클래스
 * 홈 페이지의 탭 바에 통합
 */
export class TabInjector {
  private groups: Group[] = [];
  private videoGridRenderer: VideoGridRenderer | null = null;
  private injectRetryCount: number = 0;
  private readonly MAX_INJECT_RETRIES: number = 10;

  constructor() {
    this.init();
  }

  private async init() {
    this.groups = await StorageManager.getGroups();
    this.injectTabs();
    this.setupURLListener();
  }

  /**
   * YouTube 홈 페이지의 탭 바에 그룹 탭 추가
   */
  private injectTabs() {
    // YouTube 홈 페이지의 탭 바 찾기
    const tabsContainer = document.querySelector('#chips, ytd-feed-filter-chip-bar-renderer');

    if (!tabsContainer) {
      // 최대 재시도 횟수 초과 시 중단
      if (this.injectRetryCount >= this.MAX_INJECT_RETRIES) {
        // 홈 페이지가 아닌 경우는 정상적인 상황이므로 로그만 출력
        if (window.location.pathname !== '/') {
          console.log('[TabInjector] Not on home page, skipping tab injection.');
        } else {
          console.log('[TabInjector] Max retries reached, tabs container not found on home page.');
        }
        return;
      }

      this.injectRetryCount++;
      // 디버그용 로그 (Issues 패널에 표시되지 않음)
      console.log(`[TabInjector] Waiting for tabs container (${this.injectRetryCount}/${this.MAX_INJECT_RETRIES})...`);
      setTimeout(() => this.injectTabs(), 1000);
      return;
    }

    // 재시도 카운트 리셋 (성공 시)
    this.injectRetryCount = 0;

    // 이미 추가되었는지 확인
    if (document.querySelector('#mytube-group-tabs')) {
      return;
    }

    // 그룹 탭 컨테이너 생성
    const groupTabsContainer = document.createElement('div');
    groupTabsContainer.id = 'mytube-group-tabs';
    groupTabsContainer.className = 'mytube-tabs-container';

    // 각 그룹마다 탭 생성
    this.groups.forEach(group => {
      const tab = this.createGroupTab(group);
      groupTabsContainer.appendChild(tab);
    });

    // 탭 바에 추가
    tabsContainer.appendChild(groupTabsContainer);

    console.log('[TabInjector] Tabs injected');
  }

  /**
   * 개별 그룹 탭 생성
   */
  private createGroupTab(group: Group): HTMLElement {
    const tab = document.createElement('button');
    tab.className = 'mytube-group-tab';
    tab.dataset.groupId = group.id;

    const videoCount = group.videos?.length || 0;

    tab.innerHTML = `
      <span class="mytube-tab-icon">${group.icon || '📁'}</span>
      <span class="mytube-tab-name">${this.escapeHtml(group.name)}</span>
      <span class="mytube-tab-count">${videoCount}</span>
    `;

    tab.addEventListener('click', () => {
      this.handleTabClick(group.id);
    });

    return tab;
  }

  /**
   * 탭 클릭 핸들러
   */
  private async handleTabClick(groupId: string) {

    // 모든 탭에서 active 제거
    document.querySelectorAll('.mytube-group-tab').forEach(tab => {
      tab.classList.remove('active');
    });

    // 클릭된 탭에 active 추가
    const clickedTab = document.querySelector(`[data-group-id="${groupId}"]`);
    clickedTab?.classList.add('active');

    // URL 변경 (뒤로가기 지원)
    const newUrl = `/mytube/group/${groupId}`;
    window.history.pushState({ groupId }, '', newUrl);

    // 영상 그리드 표시
    await this.showVideoGrid(groupId);
  }

  /**
   * 영상 그리드 표시
   */
  private async showVideoGrid(groupId: string) {
    // YouTube의 메인 컨텐츠 영역 찾기
    const mainContent = document.querySelector('ytd-browse[page-subtype="home"], #contents');

    if (!mainContent) {
      console.warn('[TabInjector] Main content not found');
      return;
    }

    // 기존 YouTube 컨텐츠 숨기기
    const youtubeContent = document.querySelector('ytd-rich-grid-renderer, ytd-two-column-browse-results-renderer');
    if (youtubeContent) {
      (youtubeContent as HTMLElement).style.display = 'none';
    }

    // 영상 그리드 렌더러 생성 또는 업데이트
    if (!this.videoGridRenderer) {
      this.videoGridRenderer = new VideoGridRenderer();
    }

    await this.videoGridRenderer.render(groupId, mainContent as HTMLElement);
  }

  /**
   * URL 변경 감지 (뒤로가기/앞으로가기)
   */
  private setupURLListener() {
    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.groupId) {
        this.showVideoGrid(event.state.groupId);
      } else {
        // YouTube 기본 페이지로 복원
        this.restoreYouTubeContent();
      }
    });

    // YouTube SPA 네비게이션 감지
    const observer = new MutationObserver(() => {
      const url = window.location.pathname;
      if (!url.startsWith('/mytube/')) {
        this.restoreYouTubeContent();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * YouTube 기본 컨텐츠 복원
   */
  private restoreYouTubeContent() {
    const youtubeContent = document.querySelector('ytd-rich-grid-renderer, ytd-two-column-browse-results-renderer');
    if (youtubeContent) {
      (youtubeContent as HTMLElement).style.display = '';
    }

    const mytubeGrid = document.querySelector('#mytube-video-grid');
    if (mytubeGrid) {
      mytubeGrid.remove();
    }

    // 모든 탭에서 active 제거
    document.querySelectorAll('.mytube-group-tab').forEach(tab => {
      tab.classList.remove('active');
    });
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
   * 그룹 업데이트
   */
  async update(groups: Group[]) {
    this.groups = groups;
    this.injectRetryCount = 0; // 업데이트 시 재시도 카운트 리셋

    // 기존 탭 제거
    const existing = document.querySelector('#mytube-group-tabs');
    if (existing) {
      existing.remove();
    }

    // 다시 주입
    this.injectTabs();
  }
}
