import { StorageManager } from '../utils/storage';
import { YouTubeParser } from '../utils/youtube';
import type { Group } from '../types';
import { SidebarInjector } from './sidebar-injector';
import { TabInjector } from './tab-injector';
import { InPageApp } from './in-page-app';
import { AutoCollector } from './auto-collector';
import { DownloadButtonInjector } from './download-button-injector';
import './styles.css';

/**
 * Content Script Main Entry
 * YouTube 페이지에 주입되어 실행됨
 */
class MyTubeContentScript {
  private sidebarInjector: SidebarInjector | null = null;
  private tabInjector: TabInjector | null = null;
  private inPageApp: InPageApp | null = null;
  private autoCollector: AutoCollector | null = null;
  private downloadButtonInjector: DownloadButtonInjector | null = null;
  private groups: Group[] = [];

  constructor() {
    this.init();
  }

  private async init() {
    console.log('[MyTube] Content script loaded');

    // 초기 그룹 로드
    await this.loadGroups();

    // YouTube 페이지 로드 대기
    this.waitForYouTubeLoad();

    // 스토리지 변경 감지
    StorageManager.onChanged((changes) => {
      if (changes.groups) {
        this.groups = changes.groups;
        this.updateSidebar();
      }
    });

    // Popup과의 통신 설정
    this.setupMessageListener();

    // 다운로드 버튼 인젝터 초기화 (영상 페이지에서 동작)
    if (!this.downloadButtonInjector) {
      this.downloadButtonInjector = new DownloadButtonInjector();
      console.log('[MyTube] DownloadButtonInjector initialized');
    }
  }

  private async loadGroups() {
    this.groups = await StorageManager.getGroups();
  }

  private waitForYouTubeLoad() {
    // YouTube는 SPA이므로 DOM이 동적으로 변경됨
    // MutationObserver로 사이드바가 로드될 때까지 대기
    const observer = new MutationObserver(() => {
      const sidebar = YouTubeParser.getSidebar();
      if (sidebar && !this.sidebarInjector) {
        console.log('[MyTube] YouTube sidebar detected');
        this.injectSidebar();
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 이미 로드된 경우를 위한 즉시 체크
    const sidebar = YouTubeParser.getSidebar();
    if (sidebar) {
      this.injectSidebar();
      observer.disconnect();
    }
  }

  private injectSidebar() {
    if (this.sidebarInjector) return;

    this.sidebarInjector = new SidebarInjector(this.groups);
    console.log('[MyTube] Sidebar injected');

    // 인페이지 UI 주입 (홈 페이지에서 그룹 카드 표시)
    if (!this.inPageApp) {
      this.inPageApp = new InPageApp();
      console.log('[MyTube] InPageApp injected');
    }

    // 자동 수집기 초기화 (채널 페이지 방문 시 실시간 수집)
    if (!this.autoCollector) {
      this.autoCollector = new AutoCollector();
      console.log('[MyTube] AutoCollector initialized');
    }

    // 탭도 주입 (홈 페이지인 경우)
    if (!this.tabInjector && window.location.pathname === '/') {
      this.tabInjector = new TabInjector();
      console.log('[MyTube] Tabs injected');
    }
  }

  private updateSidebar() {
    if (this.sidebarInjector) {
      this.sidebarInjector.update(this.groups);
    }
    if (this.tabInjector) {
      this.tabInjector.update(this.groups);
    }
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'GET_CHANNEL_INFO') {
        const channel = YouTubeParser.extractChannelFromPage();
        sendResponse({ channel });
      }
      return true;
    });
  }
}

// 스크립트 실행
new MyTubeContentScript();
