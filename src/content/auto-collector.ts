import { StorageManager } from '../utils/storage';
import { RealtimeParser } from '../utils/realtime-parser';
import { YouTubeParser } from '../utils/youtube';

/**
 * 채널 페이지 방문 시 자동으로 영상을 수집하는 클래스
 * PockeTube 스타일 - 별도 수집 버튼 없이 실시간 자동 수집
 */
export class AutoCollector {
    private isCollecting: boolean = false;
    private lastCollectedChannelId: string | null = null;
    private observer: MutationObserver | null = null;

    constructor() {
        this.init();
    }

    private async init() {
        // 초기 수집 시도
        await this.tryCollect();

        // URL 변경 감지 (YouTube SPA 네비게이션)
        this.watchNavigation();

        // 페이지 콘텐츠 변경 감지
        this.watchContentChanges();

        console.log('[AutoCollector] Initialized');
    }

    /**
     * URL 변경 감지
     */
    private watchNavigation() {
        // popstate 이벤트
        window.addEventListener('popstate', () => {
            setTimeout(() => this.tryCollect(), 500);
        });

        // YouTube uses yt-navigate-finish for SPA navigation
        document.addEventListener('yt-navigate-finish', () => {
            setTimeout(() => this.tryCollect(), 500);
        });
    }

    /**
     * 콘텐츠 변경 감지 (초기 로드 대응)
     */
    private watchContentChanges() {
        this.observer = new MutationObserver(() => {
            // ytInitialData가 로드되었는지 확인
            if ((window as any).ytInitialData && !this.isCollecting) {
                this.tryCollect();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 5초 후 observer 해제 (초기 로드만 필요)
        setTimeout(() => {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        }, 5000);
    }

    /**
     * 현재 페이지에서 수집 시도
     */
    private async tryCollect() {
        if (this.isCollecting) return;

        const channelId = YouTubeParser.getChannelIdFromUrl();
        if (!channelId) return;

        // 같은 채널 중복 수집 방지
        if (channelId === this.lastCollectedChannelId) return;

        // 이 채널이 속한 그룹 찾기
        const groups = await StorageManager.getGroups();
        const matchingGroups = groups.filter(g =>
            g.channels.some(c => c.id === channelId)
        );

        if (matchingGroups.length === 0) {
            console.log(`[AutoCollector] Channel ${channelId} is not in any group, skipping`);
            return;
        }

        console.log(`[AutoCollector] Found channel ${channelId} in ${matchingGroups.length} group(s)`);

        this.isCollecting = true;
        this.lastCollectedChannelId = channelId;

        try {
            // 채널 정보 가져오기
            const channel = {
                id: channelId,
                name: YouTubeParser.getChannelName() || 'Unknown Channel',
                thumbnail: YouTubeParser.getChannelThumbnail()
            };

            // 각 그룹에 영상 추가
            for (const group of matchingGroups) {
                const videos = RealtimeParser.parseChannelVideos(channel, group.id);

                // 디버그: 처음 3개 영상의 조회수 출력
                console.log('[AutoCollector] Parsed videos sample:',
                    videos.slice(0, 3).map(v => ({
                        title: v.title.substring(0, 30),
                        viewCount: v.viewCount,
                        uploadedAt: new Date(v.uploadedAt).toLocaleString()
                    }))
                );

                if (videos.length > 0) {
                    // 기존 영상과 중복 제거
                    const existingIds = new Set((group.videos || []).map(v => v.id));
                    const newVideos = videos.filter(v => !existingIds.has(v.id));

                    if (newVideos.length > 0) {
                        await StorageManager.addVideosToGroup(group.id, newVideos);
                        console.log(`[AutoCollector] Added ${newVideos.length} new videos to group "${group.name}"`);

                        // 알림 표시
                        this.showNotification(group.name, newVideos.length);
                    } else {
                        console.log(`[AutoCollector] No new videos for group "${group.name}"`);
                    }
                }
            }
        } catch (error) {
            console.error('[AutoCollector] Collection failed:', error);
        } finally {
            this.isCollecting = false;
        }
    }

    /**
     * 수집 알림 표시 (비침투적)
     */
    private showNotification(groupName: string, count: number) {
        // 기존 알림 제거
        const existing = document.querySelector('#pocketmontube-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.id = 'pocketmontube-notification';
        notification.innerHTML = `
      <div class="pocketmontube-notif-content">
        <span class="pocketmontube-notif-icon">📺</span>
        <span class="pocketmontube-notif-text">
          <strong>${this.escapeHtml(groupName)}</strong>에 ${count}개 영상 추가됨
        </span>
      </div>
    `;

        document.body.appendChild(notification);

        // 3초 후 자동 제거
        setTimeout(() => notification.remove(), 3000);
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
