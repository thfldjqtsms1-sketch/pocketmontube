import type { Video, Channel } from '../types';

/**
 * YouTube 페이지의 ytInitialData에서 실시간으로 영상 데이터 파싱
 * PockeTube 스타일 - 추가 HTTP 요청 없이 즉시 데이터 추출
 */
export class RealtimeParser {
    /**
     * 현재 페이지의 ytInitialData 가져오기
     */
    static getYtInitialData(): any {
        // 먼저 window 객체에서 시도
        if ((window as any).ytInitialData) {
            return (window as any).ytInitialData;
        }

        // script 태그에서 추출
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
            const text = script.textContent || '';
            if (text.includes('var ytInitialData = ')) {
                const match = text.match(/var ytInitialData = ({.*?});/s);
                if (match) {
                    try {
                        return JSON.parse(match[1]);
                    } catch (e) {
                        console.error('[RealtimeParser] Failed to parse ytInitialData:', e);
                    }
                }
            }
        }

        return null;
    }

    /**
     * 채널 페이지에서 영상 목록 추출
     */
    static parseChannelVideos(channel: Channel, groupId: string): Video[] {
        const data = this.getYtInitialData();
        if (!data) {
            console.warn('[RealtimeParser] No ytInitialData found');
            return [];
        }

        const videos: Video[] = [];

        try {
            // 채널 비디오 탭 찾기
            const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];

            for (const tab of tabs) {
                const tabRenderer = tab.tabRenderer;
                if (!tabRenderer?.selected) continue;

                const contents = tabRenderer?.content?.richGridRenderer?.contents ||
                    tabRenderer?.content?.sectionListRenderer?.contents || [];

                for (const item of contents) {
                    const video = this.extractVideoFromItem(item, channel, groupId);
                    if (video) {
                        videos.push(video);
                    }
                }
            }
        } catch (error) {
            console.error('[RealtimeParser] Error parsing channel videos:', error);
        }

        return videos;
    }

    /**
     * 홈/구독 페이지에서 영상 목록 추출
     */
    static parseHomeVideos(): Video[] {
        const data = this.getYtInitialData();
        if (!data) return [];

        const videos: Video[] = [];

        try {
            const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]
                ?.tabRenderer?.content?.richGridRenderer?.contents || [];

            for (const item of contents) {
                const video = this.extractVideoFromRichItem(item);
                if (video) {
                    videos.push(video);
                }
            }
        } catch (error) {
            console.error('[RealtimeParser] Error parsing home videos:', error);
        }

        return videos;
    }

    /**
     * 구독 피드에서 영상 추출
     */
    static parseSubscriptionVideos(): Video[] {
        const data = this.getYtInitialData();
        if (!data) return [];

        const videos: Video[] = [];

        try {
            // 구독 피드 구조
            const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]
                ?.tabRenderer?.content?.sectionListRenderer?.contents || [];

            for (const section of contents) {
                const items = section?.itemSectionRenderer?.contents || [];
                for (const item of items) {
                    const video = this.extractVideoFromRichItem(item);
                    if (video) {
                        videos.push(video);
                    }
                }
            }
        } catch (error) {
            console.error('[RealtimeParser] Error parsing subscription videos:', error);
        }

        return videos;
    }

    /**
     * richItemRenderer에서 비디오 추출
     */
    private static extractVideoFromRichItem(item: any): Video | null {
        const videoRenderer = item?.richItemRenderer?.content?.videoRenderer ||
            item?.videoRenderer ||
            item?.gridVideoRenderer;

        if (!videoRenderer) return null;

        return this.parseVideoRenderer(videoRenderer, '', '');
    }

    /**
     * 아이템에서 비디오 추출 (채널 페이지용)
     */
    private static extractVideoFromItem(item: any, channel: Channel, groupId: string): Video | null {
        const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
        if (!videoRenderer) return null;

        return this.parseVideoRenderer(videoRenderer, channel.id, groupId, channel.name);
    }

    /**
     * videoRenderer 파싱
     */
    private static parseVideoRenderer(
        renderer: any,
        channelId: string,
        groupId: string,
        channelName?: string
    ): Video | null {
        try {
            const videoId = renderer.videoId;
            if (!videoId) return null;

            // 제목
            const title = renderer.title?.runs?.[0]?.text ||
                renderer.title?.simpleText ||
                'Unknown';

            // 썸네일
            const thumbnails = renderer.thumbnail?.thumbnails || [];
            const thumbnail = thumbnails[thumbnails.length - 1]?.url ||
                `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            // 재생 시간 - thumbnailOverlays에서 먼저 찾기 (더 정확함)
            let duration = '0:00';
            const overlays = renderer.thumbnailOverlays || [];
            for (const overlay of overlays) {
                const timeOverlay = overlay?.thumbnailOverlayTimeStatusRenderer;
                if (timeOverlay && timeOverlay.style === 'DEFAULT') {
                    duration = timeOverlay.text?.simpleText ||
                        timeOverlay.text?.accessibility?.accessibilityData?.label ||
                        duration;
                    break;
                }
                // SHORTS는 별도로 처리
                if (timeOverlay && timeOverlay.style === 'SHORTS') {
                    duration = 'Shorts';
                    break;
                }
            }
            // 백업: lengthText에서 찾기
            if (duration === '0:00') {
                duration = renderer.lengthText?.simpleText ||
                    renderer.lengthText?.accessibility?.accessibilityData?.label ||
                    '0:00';
            }

            // 조회수 파싱
            const viewCountText = renderer.viewCountText?.simpleText ||
                renderer.viewCountText?.runs?.[0]?.text ||
                renderer.shortViewCountText?.simpleText ||
                renderer.shortViewCountText?.accessibility?.accessibilityData?.label || '';
            const viewCount = this.parseViewCount(viewCountText);

            // 디버그 (처음 몇 개만)
            if (Math.random() < 0.1) {
                console.log('[RealtimeParser] viewCountText:', viewCountText, '-> viewCount:', viewCount);
            }

            // 발행 시간 파싱
            const publishedText = renderer.publishedTimeText?.simpleText ||
                renderer.publishedTimeText?.runs?.[0]?.text || '';
            const uploadedAt = this.parsePublishedTime(publishedText);

            // 채널 정보
            const extractedChannelName = channelName ||
                renderer.ownerText?.runs?.[0]?.text ||
                renderer.shortBylineText?.runs?.[0]?.text ||
                'Unknown Channel';

            const extractedChannelId = channelId ||
                renderer.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
                '';

            // Shorts 여부 (duration이 'Shorts'이거나 reel 엔드포인트가 있는 경우)
            const isShorts = duration === 'Shorts' ||
                duration === 'SHORTS' ||
                renderer.navigationEndpoint?.reelWatchEndpoint != null;

            // 바이럴 지수 계산
            const hoursAge = Math.max(1, (Date.now() - uploadedAt) / (1000 * 60 * 60));
            const viralScore = Math.round(viewCount / hoursAge);

            return {
                id: videoId,
                title,
                channelId: extractedChannelId,
                channelName: extractedChannelName,
                thumbnail,
                duration: isShorts ? 'Shorts' : duration,
                viewCount,
                uploadedAt,
                url: isShorts
                    ? `https://www.youtube.com/shorts/${videoId}`
                    : `https://www.youtube.com/watch?v=${videoId}`,
                watched: false,
                groupId,
                isShorts,
                viralScore
            };
        } catch (error) {
            console.error('[RealtimeParser] Error parsing video renderer:', error);
            return null;
        }
    }

    /**
     * 조회수 파싱
     */
    private static parseViewCount(text: string): number {
        if (!text) return 0;

        // 숫자 추출
        const numMatch = text.match(/([0-9,.]+)/);
        if (!numMatch) return 0;

        let num = parseFloat(numMatch[1].replace(/,/g, ''));
        if (isNaN(num)) return 0;

        // 한국어 단위
        if (text.includes('억')) return Math.floor(num * 100000000);
        if (text.includes('만')) return Math.floor(num * 10000);
        if (text.includes('천')) return Math.floor(num * 1000);

        // 영어 단위
        if (text.includes('B') || text.includes('b')) return Math.floor(num * 1000000000);
        if (text.includes('M') || text.includes('m')) return Math.floor(num * 1000000);
        if (text.includes('K') || text.includes('k')) return Math.floor(num * 1000);

        return Math.floor(num);
    }

    /**
     * 발행 시간 파싱
     */
    private static parsePublishedTime(text: string): number {
        if (!text) return Date.now();

        const now = Date.now();
        const lowerText = text.toLowerCase();

        // 숫자 추출
        const numMatch = lowerText.match(/(\d+)/);
        if (!numMatch) return now;

        const value = parseInt(numMatch[1]);

        // 시간 단위 매칭
        if (lowerText.includes('초') || lowerText.includes('second')) {
            return now - value * 1000;
        }
        if (lowerText.includes('분') || lowerText.includes('minute')) {
            return now - value * 60 * 1000;
        }
        if (lowerText.includes('시간') || lowerText.includes('hour')) {
            return now - value * 60 * 60 * 1000;
        }
        if (lowerText.includes('일') || lowerText.includes('day')) {
            return now - value * 24 * 60 * 60 * 1000;
        }
        if (lowerText.includes('주') || lowerText.includes('week')) {
            return now - value * 7 * 24 * 60 * 60 * 1000;
        }
        if (lowerText.includes('개월') || lowerText.includes('month')) {
            return now - value * 30 * 24 * 60 * 60 * 1000;
        }
        if (lowerText.includes('년') || lowerText.includes('year')) {
            return now - value * 365 * 24 * 60 * 60 * 1000;
        }

        return now;
    }

    /**
     * Shorts 전용 파싱
     */
    static parseShortsFromShelf(channel: Channel, groupId: string): Video[] {
        const data = this.getYtInitialData();
        if (!data) return [];

        const videos: Video[] = [];

        try {
            const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];

            for (const tab of tabs) {
                const contents = tab.tabRenderer?.content?.richGridRenderer?.contents || [];

                for (const item of contents) {
                    const reelRenderer = item?.richItemRenderer?.content?.reelItemRenderer;
                    const shortsModel = item?.richItemRenderer?.content?.shortsLockupViewModel;

                    if (reelRenderer) {
                        const video = this.parseReelRenderer(reelRenderer, channel, groupId);
                        if (video) videos.push(video);
                    } else if (shortsModel) {
                        const video = this.parseShortsViewModel(shortsModel, channel, groupId);
                        if (video) videos.push(video);
                    }
                }
            }
        } catch (error) {
            console.error('[RealtimeParser] Error parsing shorts:', error);
        }

        return videos;
    }

    private static parseReelRenderer(renderer: any, channel: Channel, groupId: string): Video | null {
        const videoId = renderer.videoId;
        if (!videoId) return null;

        const title = renderer.headline?.simpleText || 'Shorts';
        const thumbnail = renderer.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const viewCountText = renderer.viewCountText?.simpleText || '';
        const viewCount = this.parseViewCount(viewCountText);

        return {
            id: videoId,
            title,
            channelId: channel.id,
            channelName: channel.name,
            thumbnail,
            duration: 'Shorts',
            viewCount,
            uploadedAt: Date.now(),
            url: `https://www.youtube.com/shorts/${videoId}`,
            watched: false,
            groupId,
            isShorts: true
        };
    }

    private static parseShortsViewModel(model: any, channel: Channel, groupId: string): Video | null {
        const videoId = model.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
        if (!videoId) return null;

        const title = model.overlayMetadata?.primaryText?.content || 'Shorts';
        const thumbnail = model.thumbnail?.sources?.slice(-1)[0]?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const viewCountText = model.overlayMetadata?.secondaryText?.content || '';
        const viewCount = this.parseViewCount(viewCountText);

        return {
            id: videoId,
            title,
            channelId: channel.id,
            channelName: channel.name,
            thumbnail,
            duration: 'Shorts',
            viewCount,
            uploadedAt: Date.now(),
            url: `https://www.youtube.com/shorts/${videoId}`,
            watched: false,
            groupId,
            isShorts: true
        };
    }
}
