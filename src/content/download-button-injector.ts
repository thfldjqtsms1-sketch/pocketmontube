/**
 * YouTube 영상 페이지에서 다운로드 버튼을 영상 오른쪽 위에 인젝션하는 클래스
 */
export class DownloadButtonInjector {
    private button: HTMLElement | null = null;
    private observer: MutationObserver | null = null;

    constructor() {
        this.init();
    }

    private init() {
        // YouTube는 SPA이므로 URL 변경 감지
        this.observeUrlChanges();

        // 초기 로드 시 체크
        this.checkAndInject();
    }

    private observeUrlChanges() {
        // YouTube의 yt-navigate-finish 이벤트 감지
        window.addEventListener('yt-navigate-finish', () => {
            this.checkAndInject();
        });

        // popstate도 감지
        window.addEventListener('popstate', () => {
            setTimeout(() => this.checkAndInject(), 500);
        });
    }

    private isVideoPage(): boolean {
        return window.location.pathname === '/watch';
    }

    private isShortsPage(): boolean {
        return window.location.pathname.startsWith('/shorts/');
    }

    private getVideoId(): string | null {
        // 일반 영상
        if (this.isVideoPage()) {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('v');
        }

        // 숏츠 - URL에서 직접 추출 (/shorts/{videoId})
        if (this.isShortsPage()) {
            const match = window.location.pathname.match(/\/shorts\/([^/?]+)/);
            return match ? match[1] : null;
        }

        return null;
    }

    private checkAndInject() {
        if (this.isVideoPage() || this.isShortsPage()) {
            // 영상 플레이어가 로드될 때까지 대기
            this.waitForPlayer();
        } else {
            // 영상 페이지가 아니면 버튼 제거
            this.removeButton();
        }
    }

    private waitForPlayer() {
        const isShorts = this.isShortsPage();
        console.log(`[MyTube Download] Waiting for player... (Shorts: ${isShorts})`);

        // 이미 버튼이 있으면 업데이트만
        const existingButton = document.querySelector('.mytube-download-btn');
        if (existingButton) {
            console.log('[MyTube Download] Button already exists, updating video ID');
            this.updateButtonVideoId();
            return;
        }

        // 플레이어 컨테이너 찾기 (여러 선택자 시도)
        // 숏츠는 다른 플레이어 구조를 가짐
        const selectors = isShorts
            ? ['ytd-shorts-player-controls', 'ytd-reel-video-renderer', '#shorts-player', '.ytd-reel-video-renderer', 'ytd-shorts']
            : ['#movie_player', '.html5-video-player', 'ytd-player'];

        let player: HTMLElement | null = null;

        for (const selector of selectors) {
            player = document.querySelector(selector) as HTMLElement;
            if (player) {
                console.log(`[MyTube Download] Found player with selector: ${selector}`);
                break;
            }
        }

        if (player) {
            this.injectButton(player, isShorts);
            return;
        }

        console.log('[MyTube Download] Player not found, setting up observer...');

        // 플레이어를 찾을 수 없으면 MutationObserver로 대기
        if (this.observer) {
            this.observer.disconnect();
        }

        let attempts = 0;
        const maxAttempts = 50;

        this.observer = new MutationObserver(() => {
            attempts++;
            for (const selector of selectors) {
                const player = document.querySelector(selector) as HTMLElement;
                if (player) {
                    console.log(`[MyTube Download] Found player after ${attempts} mutations: ${selector}`);
                    this.injectButton(player, isShorts);
                    this.observer?.disconnect();
                    return;
                }
            }

            if (attempts >= maxAttempts) {
                console.log('[MyTube Download] Max attempts reached, stopping observer');
                this.observer?.disconnect();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 10초 후 타임아웃
        setTimeout(() => {
            this.observer?.disconnect();
        }, 10000);
    }

    private injectButton(player: HTMLElement, isShorts: boolean = false) {
        // 이미 버튼이 있으면 스킵
        if (player.querySelector('.mytube-download-btn')) {
            return;
        }

        const videoId = this.getVideoId();
        if (!videoId) return;

        // 다운로드 버튼 생성
        this.button = document.createElement('div');
        this.button.className = isShorts ? 'mytube-download-btn mytube-download-btn-shorts' : 'mytube-download-btn';
        this.button.setAttribute('data-video-id', videoId);
        this.button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>다운로드</span>
    `;

        // 클릭 이벤트
        this.button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleDownload(videoId);
        });

        // 마우스 오버 이벤트
        this.button.addEventListener('mouseenter', () => {
            this.button?.classList.add('hover');
        });

        this.button.addEventListener('mouseleave', () => {
            this.button?.classList.remove('hover');
        });

        // 플레이어에 추가 (position: relative 확인)
        const computedStyle = window.getComputedStyle(player);
        if (computedStyle.position === 'static') {
            player.style.position = 'relative';
        }

        player.appendChild(this.button);
        console.log('[MyTube] Download button injected');
    }

    private updateButtonVideoId() {
        const videoId = this.getVideoId();
        if (this.button && videoId) {
            this.button.setAttribute('data-video-id', videoId);
        }
    }

    private handleDownload(videoId: string) {
        // 다운로드 옵션 선택
        const mode = prompt('다운로드 옵션을 선택하세요:\n1. 영상 (video)\n2. 음성 (audio)\n3. 자막 (subs)', 'video');

        if (!mode) return; // 취소

        const validMode = mode === 'audio' ? 'audio' : mode === 'subs' ? 'subs' : 'video';

        // 백그라운드 스크립트로 다운로드 요청
        chrome.runtime.sendMessage(
            {
                type: 'DOWNLOAD_VIDEO',
                videoId: videoId,
                mode: validMode
            },
            (response) => {
                if (response && response.success) {
                    console.log('[MyTube] Download started:', response.message);
                    // 파일 목록 페이지 열기
                    if (response.filesUrl) {
                        window.open(response.filesUrl, '_blank');
                    }
                } else {
                    console.error('[MyTube] Download failed:', response?.error);
                    alert('다운로드 실패: ' + (response?.error || '알 수 없는 오류'));
                }
            }
        );
    }

    private removeButton() {
        if (this.button) {
            this.button.remove();
            this.button = null;
        }

        // 모든 다운로드 버튼 제거
        document.querySelectorAll('.mytube-download-btn').forEach(btn => btn.remove());
    }

    public destroy() {
        this.removeButton();
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
