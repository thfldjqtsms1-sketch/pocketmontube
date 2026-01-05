/**
 * GitHub Actions용 YouTube 영상 수집 스크립트
 * Puppeteer 없이 직접 HTTP fetch로 수집
 */

import * as fs from 'fs';
import * as path from 'path';

// 타입 정의
interface Channel {
    id: string;
    name: string;
}

interface Group {
    id: string;
    name: string;
    icon?: string;
    channels: Channel[];
}

interface ChannelsData {
    groups: Group[];
    lastExported: string | null;
}

interface Video {
    id: string;
    title: string;
    channelId: string;
    channelName: string;
    thumbnail: string;
    duration: string;
    viewCount: number;
    uploadedAt: number;
    url: string;
    isShorts: boolean;
    groupId: string;
    viralScore?: number;
}

interface VideosData {
    lastUpdated: string | null;
    videos: Video[];
}

// 데이터 파일 경로
const DATA_DIR = path.join(process.cwd(), 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');

// 유틸리티 함수
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// RSS 피드에서 영상 목록 가져오기
async function fetchRSSVideos(channel: Channel, groupId: string): Promise<Video[]> {
    const videos: Video[] = [];

    try {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
        console.log(`[Collect] Fetching RSS for ${channel.name}...`);

        const response = await fetch(rssUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            console.warn(`[Collect] RSS fetch failed for ${channel.name}: ${response.status}`);
            return videos;
        }

        const xml = await response.text();
        const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);

        for (const match of entryMatches) {
            const entryXml = match[1];

            const videoIdMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
            const videoId = videoIdMatch?.[1];
            if (!videoId) continue;

            const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch?.[1] || 'Unknown';

            const publishedMatch = entryXml.match(/<published>([^<]+)<\/published>/);
            const published = publishedMatch?.[1];
            const uploadedAt = published ? new Date(published).getTime() : Date.now();

            videos.push({
                id: videoId,
                title,
                channelId: channel.id,
                channelName: channel.name,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                duration: '0:00',
                viewCount: 0,
                uploadedAt,
                url: `https://www.youtube.com/watch?v=${videoId}`,
                isShorts: false,
                groupId
            });
        }

        console.log(`[Collect] Found ${videos.length} videos from ${channel.name}`);
    } catch (error) {
        console.error(`[Collect] RSS error for ${channel.name}:`, error);
    }

    return videos;
}

// 영상 상세 정보 가져오기 (조회수, duration)
async function fetchVideoDetails(videoId: string): Promise<{ viewCount: number; duration: string; isShorts: boolean } | null> {
    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

        if (!response.ok) {
            console.warn(`[Collect] Video fetch failed for ${videoId}: ${response.status}`);
            return null;
        }

        const html = await response.text();

        // 조회수 추출
        let viewCount = 0;
        const viewMatch = html.match(/"viewCount":"(\d+)"/);
        if (viewMatch?.[1]) {
            viewCount = parseInt(viewMatch[1], 10);
        }

        // Duration 추출 (여러 패턴)
        let duration = '0:00';
        let totalSeconds = 0;

        // 패턴 1: lengthSeconds
        const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);
        if (lengthMatch?.[1]) {
            totalSeconds = parseInt(lengthMatch[1], 10);
            duration = formatDuration(totalSeconds);
        }

        // 패턴 2: approxDurationMs
        if (totalSeconds === 0) {
            const approxMatch = html.match(/"approxDurationMs":"(\d+)"/);
            if (approxMatch?.[1]) {
                totalSeconds = Math.floor(parseInt(approxMatch[1], 10) / 1000);
                duration = formatDuration(totalSeconds);
            }
        }

        // Shorts 판별 (3분 미만)
        const isShorts = totalSeconds > 0 && totalSeconds < 180;

        return { viewCount, duration, isShorts };
    } catch (error) {
        console.error(`[Collect] Video details error for ${videoId}:`, error);
        return null;
    }
}

// 메인 수집 함수
async function collectVideos(): Promise<void> {
    console.log('[Collect] Starting video collection...');
    console.log(`[Collect] Current directory: ${process.cwd()}`);

    // 채널 목록 로드
    if (!fs.existsSync(CHANNELS_FILE)) {
        console.log('[Collect] No channels.json found. Creating empty file.');
        fs.writeFileSync(CHANNELS_FILE, JSON.stringify({ groups: [], lastExported: null }, null, 2));
        return;
    }

    const channelsData: ChannelsData = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));

    if (channelsData.groups.length === 0) {
        console.log('[Collect] No groups found. Please export channels from the extension first.');
        return;
    }

    // 기존 영상 데이터 로드
    let existingVideos: Video[] = [];
    if (fs.existsSync(VIDEOS_FILE)) {
        const videosData: VideosData = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf-8'));
        existingVideos = videosData.videos || [];
    }
    const existingIds = new Set(existingVideos.map(v => v.id));

    console.log(`[Collect] Existing videos: ${existingIds.size}`);

    // 모든 그룹의 채널에서 영상 수집
    const allNewVideos: Video[] = [];
    const allUpdatedVideos: Video[] = [...existingVideos];

    for (const group of channelsData.groups) {
        console.log(`[Collect] Processing group: ${group.name} (${group.channels.length} channels)`);

        for (const channel of group.channels) {
            // RSS로 영상 목록 수집
            const rssVideos = await fetchRSSVideos(channel, group.id);

            // 새 영상만 필터링
            const newVideos = rssVideos.filter(v => !existingIds.has(v.id));

            if (newVideos.length > 0) {
                console.log(`[Collect] ${newVideos.length} new videos from ${channel.name}`);

                // 새 영상들의 상세 정보 수집
                for (const video of newVideos) {
                    const details = await fetchVideoDetails(video.id);
                    if (details) {
                        video.viewCount = details.viewCount;
                        video.duration = details.duration;
                        video.isShorts = details.isShorts;
                        if (details.isShorts) {
                            video.url = `https://www.youtube.com/shorts/${video.id}`;
                        }
                        // 바이럴 스코어 계산
                        const hoursAge = Math.max(1, (Date.now() - video.uploadedAt) / (1000 * 60 * 60));
                        video.viralScore = Math.round(video.viewCount / hoursAge);
                    }

                    allNewVideos.push(video);
                    existingIds.add(video.id);

                    // Rate limiting - 영상당 1초 대기
                    await sleep(1000);
                }
            }

            // 채널간 딜레이
            await sleep(2000);
        }
    }

    // 기존 영상 조회수 업데이트 (최근 100개만)
    console.log('[Collect] Updating view counts for recent videos...');
    const recentVideos = allUpdatedVideos
        .sort((a, b) => b.uploadedAt - a.uploadedAt)
        .slice(0, 100);

    for (const video of recentVideos) {
        const details = await fetchVideoDetails(video.id);
        if (details && details.viewCount > 0) {
            video.viewCount = details.viewCount;
            if (details.duration !== '0:00') {
                video.duration = details.duration;
                video.isShorts = details.isShorts;
            }
            // 바이럴 스코어 재계산
            const hoursAge = Math.max(1, (Date.now() - video.uploadedAt) / (1000 * 60 * 60));
            video.viralScore = Math.round(video.viewCount / hoursAge);
        }

        // Rate limiting
        await sleep(500);
    }

    // 새 영상 추가
    const finalVideos = [...allUpdatedVideos, ...allNewVideos];

    // 최대 100,000개로 제한 (오래된 것 삭제)
    finalVideos.sort((a, b) => b.uploadedAt - a.uploadedAt);
    const limitedVideos = finalVideos.slice(0, 100000);

    // 결과 저장
    const result: VideosData = {
        lastUpdated: new Date().toISOString(),
        videos: limitedVideos
    };

    fs.writeFileSync(VIDEOS_FILE, JSON.stringify(result, null, 2));

    console.log(`[Collect] Collection complete!`);
    console.log(`[Collect] New videos: ${allNewVideos.length}`);
    console.log(`[Collect] Total videos: ${limitedVideos.length}`);
    console.log(`[Collect] Last updated: ${result.lastUpdated}`);
}

// 실행
collectVideos().catch(console.error);
