import type { Video, Channel, ApiUsage } from '../types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTube Data API v3 클라이언트
 */
export class YouTubeAPI {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * 채널의 최신 영상 목록 조회
     * API 비용: 100 유닛
     */
    async searchVideos(
        channel: Channel,
        groupId: string,
        maxResults: number = 50
    ): Promise<{ videos: Video[]; unitsUsed: number }> {
        try {
            // 핸들(@username) 또는 채널 ID로 채널 정보 조회
            const channelId = await this.resolveChannelId(channel.id);
            if (!channelId) {
                console.warn(`[YouTubeAPI] Could not resolve channel ID for ${channel.id}`);
                return { videos: [], unitsUsed: 0 };
            }

            // search.list API 호출 (100 유닛)
            const searchUrl = `${YOUTUBE_API_BASE}/search?` + new URLSearchParams({
                part: 'snippet',
                channelId: channelId,
                maxResults: String(Math.min(maxResults, 50)),
                order: 'date',
                type: 'video',
                key: this.apiKey
            });

            console.log(`[YouTubeAPI] Fetching videos for channel ${channel.name}`);
            const searchResponse = await fetch(searchUrl);

            if (!searchResponse.ok) {
                const error = await searchResponse.json();
                console.error('[YouTubeAPI] Search error:', error);
                throw new Error(error.error?.message || 'API 요청 실패');
            }

            const searchData = await searchResponse.json();
            const videoIds = searchData.items?.map((item: any) => item.id.videoId).filter(Boolean) || [];

            if (videoIds.length === 0) {
                return { videos: [], unitsUsed: 100 };
            }

            // videos.list API 호출로 상세정보 가져오기 (1 유닛)
            const detailsUrl = `${YOUTUBE_API_BASE}/videos?` + new URLSearchParams({
                part: 'contentDetails,statistics,snippet',
                id: videoIds.join(','),
                key: this.apiKey
            });

            const detailsResponse = await fetch(detailsUrl);
            const detailsData = await detailsResponse.json();

            const videos: Video[] = detailsData.items?.map((item: any) => {
                const duration = this.parseDuration(item.contentDetails?.duration || 'PT0S');
                const isShorts = this.isShortsDuration(item.contentDetails?.duration || 'PT0S');

                return {
                    id: item.id,
                    title: item.snippet?.title || 'Unknown',
                    channelId: channel.id,
                    channelName: channel.name,
                    thumbnail: item.snippet?.thumbnails?.high?.url ||
                        item.snippet?.thumbnails?.medium?.url ||
                        `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
                    duration: duration,
                    viewCount: parseInt(item.statistics?.viewCount || '0'),
                    uploadedAt: new Date(item.snippet?.publishedAt).getTime(),
                    url: isShorts
                        ? `https://www.youtube.com/shorts/${item.id}`
                        : `https://www.youtube.com/watch?v=${item.id}`,
                    watched: false,
                    groupId: groupId,
                    isShorts: isShorts,
                    hasExactDate: true  // API에서 정확한 날짜 제공
                };
            }) || [];

            // 바이럴 지수 계산
            const now = Date.now();
            videos.forEach(video => {
                const hoursAge = Math.max(1, (now - video.uploadedAt) / (1000 * 60 * 60));
                video.viralScore = Math.round(video.viewCount / hoursAge);
            });

            return {
                videos,
                unitsUsed: 101  // search(100) + videos(1)
            };
        } catch (error) {
            console.error('[YouTubeAPI] Error:', error);
            throw error;
        }
    }

    /**
     * 핸들(@username)을 채널 ID로 변환
     */
    private async resolveChannelId(channelIdOrHandle: string): Promise<string | null> {
        // 이미 채널 ID 형식이면 그대로 반환
        if (channelIdOrHandle.startsWith('UC') && channelIdOrHandle.length === 24) {
            return channelIdOrHandle;
        }

        // 핸들(@username)이면 채널 검색
        if (channelIdOrHandle.startsWith('@')) {
            try {
                const searchUrl = `${YOUTUBE_API_BASE}/search?` + new URLSearchParams({
                    part: 'snippet',
                    q: channelIdOrHandle,
                    type: 'channel',
                    maxResults: '1',
                    key: this.apiKey
                });

                const response = await fetch(searchUrl);
                const data = await response.json();

                if (data.items?.[0]?.snippet?.channelId) {
                    return data.items[0].snippet.channelId;
                }
            } catch (error) {
                console.error('[YouTubeAPI] Channel resolve error:', error);
            }
        }

        return channelIdOrHandle;
    }

    /**
     * ISO 8601 duration을 읽기 쉬운 형식으로 변환
     * 예: PT1H2M3S -> 1:02:03
     */
    private parseDuration(isoDuration: string): string {
        const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return '0:00';

        const hours = parseInt(match[1] || '0');
        const minutes = parseInt(match[2] || '0');
        const seconds = parseInt(match[3] || '0');

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Shorts 여부 판별 (60초 이하)
     */
    private isShortsDuration(isoDuration: string): boolean {
        const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return false;

        const hours = parseInt(match[1] || '0');
        const minutes = parseInt(match[2] || '0');
        const seconds = parseInt(match[3] || '0');

        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        return totalSeconds <= 60;
    }

    /**
     * 기존 영상들의 상세정보 업데이트 (duration, viewCount, isShorts)
     * API 비용: 1 유닛 / 50개 영상
     */
    async getVideoDetails(
        videoIds: string[]
    ): Promise<{ updates: { videoId: string; duration: string; viewCount: number; isShorts: boolean; uploadedAt?: number }[]; unitsUsed: number }> {
        if (videoIds.length === 0) {
            return { updates: [], unitsUsed: 0 };
        }

        const allUpdates: { videoId: string; duration: string; viewCount: number; isShorts: boolean; uploadedAt?: number }[] = [];
        let totalUnitsUsed = 0;

        // 50개씩 배치 처리 (API 제한)
        for (let i = 0; i < videoIds.length; i += 50) {
            const batch = videoIds.slice(i, i + 50);

            try {
                const url = `${YOUTUBE_API_BASE}/videos?` + new URLSearchParams({
                    part: 'contentDetails,statistics,snippet',
                    id: batch.join(','),
                    key: this.apiKey
                });

                console.log(`[YouTubeAPI] Fetching details for ${batch.length} videos (batch ${Math.floor(i / 50) + 1})`);
                const response = await fetch(url);

                if (!response.ok) {
                    console.error('[YouTubeAPI] videos.list error:', response.status);
                    continue;
                }

                const data = await response.json();
                totalUnitsUsed += 1;

                for (const item of data.items || []) {
                    const isoDuration = item.contentDetails?.duration || 'PT0S';
                    const duration = this.parseDuration(isoDuration);
                    const isShorts = this.isShortsDuration(isoDuration);
                    const viewCount = parseInt(item.statistics?.viewCount || '0');
                    const uploadedAt = item.snippet?.publishedAt
                        ? new Date(item.snippet.publishedAt).getTime()
                        : undefined;

                    allUpdates.push({
                        videoId: item.id,
                        duration,
                        viewCount,
                        isShorts,
                        uploadedAt
                    });
                }
            } catch (err) {
                console.error('[YouTubeAPI] getVideoDetails error:', err);
            }
        }

        console.log(`[YouTubeAPI] Got details for ${allUpdates.length} videos (${totalUnitsUsed} units)`);
        return { updates: allUpdates, unitsUsed: totalUnitsUsed };
    }

    /**
     * API 키 유효성 검사
     */
    async validateApiKey(): Promise<boolean> {
        try {
            const url = `${YOUTUBE_API_BASE}/videos?` + new URLSearchParams({
                part: 'id',
                id: 'dQw4w9WgXcQ',  // 테스트용 영상
                key: this.apiKey
            });

            const response = await fetch(url);
            return response.ok;
        } catch {
            return false;
        }
    }
}


/**
 * API 사용량 관리
 */
export class ApiUsageTracker {
    private static DAILY_LIMIT = 10000;

    /**
     * 현재 API 사용량 조회
     */
    static async getUsage(): Promise<ApiUsage> {
        const result = await chrome.storage.local.get('apiUsage');
        const today = new Date().toISOString().split('T')[0];

        if (!result.apiUsage || result.apiUsage.date !== today) {
            // 새 날짜면 리셋
            return { date: today, unitsUsed: 0, dailyLimit: this.DAILY_LIMIT };
        }

        return result.apiUsage;
    }

    /**
     * API 사용량 추가
     */
    static async addUsage(units: number): Promise<ApiUsage> {
        const usage = await this.getUsage();
        usage.unitsUsed += units;

        await chrome.storage.local.set({ apiUsage: usage });
        console.log(`[YouTubeAPI] Usage: ${usage.unitsUsed}/${usage.dailyLimit} units`);

        return usage;
    }

    /**
     * 사용량 퍼센트 계산
     */
    static getUsagePercent(usage: ApiUsage): number {
        return Math.min(100, Math.round((usage.unitsUsed / usage.dailyLimit) * 100));
    }

    /**
     * 게이지 색상 반환
     */
    static getUsageColor(usage: ApiUsage): string {
        const percent = this.getUsagePercent(usage);
        if (percent < 50) return '#22c55e';  // 초록
        if (percent < 80) return '#eab308';  // 노랑
        return '#ef4444';  // 빨강
    }
}
