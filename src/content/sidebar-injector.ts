import type { Group } from '../types';
import { YouTubeUrl } from '../utils/youtube';
import { inPageApp } from './in-page-app';

/**
 * YouTube 사이드바에 "Subscription Groups" 섹션을 주입하는 클래스
 * 2025 최신 YouTube UI 대응
 */
export class SidebarInjector {
  private container: HTMLElement | null = null;
  private groups: Group[] = [];

  constructor(groups: Group[]) {
    this.groups = groups;
    this.inject();
  }

  /**
   * 사이드바에 그룹 섹션 주입
   */
  private inject() {
    const sidebar = document.querySelector('#guide-content, ytd-guide-renderer');
    if (!sidebar) {
      console.warn('[MyTube] Sidebar not found');
      return;
    }

    // 기존 컨테이너 제거 (중복 방지)
    const existing = document.querySelector('#mytube-groups-section');
    if (existing) {
      existing.remove();
    }

    // 컨테이너 생성
    this.container = this.createContainer();

    // 구독 섹션 찾기 (두 번째 섹션)
    const subscriptionsSection = sidebar.querySelector('ytd-guide-section-renderer:nth-child(2)');

    if (subscriptionsSection) {
      // 구독 섹션 다음에 삽입
      subscriptionsSection.after(this.container);
    } else {
      // 찾지 못하면 맨 위에 삽입
      sidebar.prepend(this.container);
    }

    this.render();
  }


  /**
   * 컨테이너 엘리먼트 생성 (Shadow DOM 사용)
   */
  private createContainer(): HTMLElement {
    const host = document.createElement('div');
    host.id = 'mytube-groups-section';

    // Shadow DOM 생성 - YouTube CSS로부터 완전 격리
    const shadow = host.attachShadow({ mode: 'open' });

    // 내부 스타일 정의
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        padding: 12px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        margin: 8px 0;
      }
      * {
        box-sizing: border-box;
        font-family: 'Roboto', 'Arial', sans-serif;
      }
      .section-header {
        padding: 8px 12px;
      }
      .section-title {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 0;
        color: #aaa;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .section-icon {
        width: 20px;
        height: 20px;
        fill: #aaa;
        opacity: 0.7;
      }
      .groups-list {
        margin-top: 4px;
      }
      .empty {
        padding: 12px 24px;
        text-align: center;
        color: #666;
        font-size: 13px;
      }
      .group {
        margin: 2px 0;
      }
      .group-header {
        display: flex;
        align-items: center;
      }
      .group-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
        padding: 8px 12px;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 14px;
        text-align: left;
        color: #0f0f0f;
      }
      .group-toggle:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .chevron {
        width: 18px;
        height: 18px;
        fill: #aaa;
        flex-shrink: 0;
        transition: transform 0.2s ease;
      }
      .group-icon {
        font-size: 18px;
        flex-shrink: 0;
      }
      .group-name {
        flex: 1;
        min-width: 0;
        font-weight: 400;
        font-size: 14px;
        color: #0f0f0f;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .group-count {
        color: #aaa;
        font-size: 12px;
        flex-shrink: 0;
        margin-left: 4px;
      }
      .overlay-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        border-radius: 50%;
        cursor: pointer;
        flex-shrink: 0;
        margin-right: 8px;
      }
      .overlay-btn:hover {
        background: rgba(255, 0, 0, 0.2);
      }
      .overlay-btn svg {
        width: 16px;
        height: 16px;
        fill: #aaa;
      }
      .overlay-btn:hover svg {
        fill: #ff0000;
      }
      .channels {
        display: none;
        padding-left: 24px;
        margin-top: 4px;
      }
      .channels.expanded {
        display: block;
      }
      .channel-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 12px;
        color: #0f0f0f;
        text-decoration: none;
        border-radius: 8px;
        margin: 2px 8px;
      }
      .channel-item:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .channel-thumb {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        flex-shrink: 0;
        object-fit: cover;
      }
      .channel-placeholder {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #555;
        flex-shrink: 0;
      }
      .channel-name {
        flex: 1;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;

    // 컨텐츠 컨테이너
    const content = document.createElement('div');
    content.className = 'content';

    shadow.appendChild(style);
    shadow.appendChild(content);

    // 참조 저장
    (host as any)._shadowContent = content;

    return host;
  }

  /**
   * 그룹 목록 렌더링 (Shadow DOM 내부)
   */
  private render() {
    if (!this.container) return;

    const content = (this.container as any)._shadowContent as HTMLElement;
    if (!content) return;

    content.innerHTML = `
      <div class="section-header">
        <h3 class="section-title">
          <svg class="section-icon" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
          구독 그룹
        </h3>
      </div>
      <div class="groups-list">
        ${this.groups.length === 0
        ? '<div class="empty">그룹을 만들어보세요!</div>'
        : this.groups.map(group => this.renderGroup(group)).join('')
      }
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * 개별 그룹 렌더링 (Shadow DOM 내부 클래스 사용)
   */
  private renderGroup(group: Group): string {
    const videoCount = group.videos?.length || 0;
    const groupName = group.name || '(이름 없음)';

    console.log('[SidebarInjector] Rendering group:', group.id, 'name:', groupName);

    return `
      <div class="group" data-group-id="${group.id}">
        <div class="group-header">
          <button class="group-toggle" data-group-id="${group.id}">
            <svg class="chevron" viewBox="0 0 24 24">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
            <span class="group-icon">${group.icon || '📁'}</span>
            <span class="group-name">${this.escapeHtml(groupName)}</span>
            <span class="group-count">${videoCount}개</span>
          </button>
          <button class="overlay-btn" data-group-id="${group.id}" title="영상 보기">
            <svg viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
            </svg>
          </button>
        </div>
        <div class="channels" data-channels-for="${group.id}">
          ${group.channels.map(channel => `
            <a href="${YouTubeUrl.channelUrl(channel.id)}" class="channel-item">
              ${channel.thumbnail
        ? `<img src="${channel.thumbnail}" class="channel-thumb" alt="">`
        : '<div class="channel-placeholder"></div>'
      }
              <span class="channel-name">${this.escapeHtml(channel.name)}</span>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * 이벤트 리스너 연결 (Shadow DOM 내부)
   */
  private attachEventListeners() {
    if (!this.container) return;

    const content = (this.container as any)._shadowContent as HTMLElement;
    if (!content) return;

    // 그룹 토글 버튼
    content.querySelectorAll('.group-toggle').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const groupId = (button as HTMLElement).dataset.groupId;
        if (groupId) {
          this.toggleGroup(groupId);
        }
      });
    });

    // 인페이지 앱 열기 버튼 (화살표)
    content.querySelectorAll('.overlay-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const groupId = (button as HTMLElement).dataset.groupId;
        if (groupId) {
          inPageApp.showOverlay(groupId);
        }
      });
    });
  }

  /**
   * 그룹 펼치기/접기 (Shadow DOM 내부)
   */
  private toggleGroup(groupId: string) {
    if (!this.container) return;

    const content = (this.container as any)._shadowContent as HTMLElement;
    if (!content) return;

    const channelsContainer = content.querySelector(`[data-channels-for="${groupId}"]`) as HTMLElement;
    const groupElement = content.querySelector(`.group[data-group-id="${groupId}"]`);
    const chevron = groupElement?.querySelector('.chevron') as HTMLElement;

    if (!channelsContainer) return;

    const isExpanded = channelsContainer.classList.contains('expanded');

    if (isExpanded) {
      channelsContainer.classList.remove('expanded');
      if (chevron) chevron.style.transform = 'rotate(0deg)';
    } else {
      channelsContainer.classList.add('expanded');
      if (chevron) chevron.style.transform = 'rotate(90deg)';
    }
  }

  /**
   * 그룹 업데이트
   */
  update(groups: Group[]) {
    this.groups = groups;
    this.render();
  }

  /**
   * HTML 이스케이프
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
