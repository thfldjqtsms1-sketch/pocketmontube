/**
 * GitHub Actions용 YouTube 영상 수집 스크립트
 * YouTube InnerTube API 사용 (youtubei.js)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Innertube } from 'youtubei.js';

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

// InnerTube 클라이언트 (전역)
let youtubeClient: Innertube | null = null;

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

// 영상 상세 정보 가져오기 (InnerTube API 사용)
async function fetchVideoDetails(videoId: string): Promise<{ viewCount: number; duration: string; isShorts: boolean } | null> {
    try {
        // InnerTube 클라이언트 초기화 (처음 한 번만)
        if (!youtubeClient) {
            console.log('[Collect] Initializing InnerTube client...');
            youtubeClient = await Innertube.create();
        }

        const info = await youtubeClient.getInfo(videoId);
        const basicInfo = info.basic_info;

        const viewCount = parseInt(basicInfo.view_count as any) || 0;
        const totalSeconds = basicInfo.duration || 0;
        const duration = formatDuration(totalSeconds);
        const isShorts = (basicInfo as any).is_short || totalSeconds < 180;

        return { viewCount, duration, isShorts };
    } catch (error: any) {
        console.warn(`[Collect] InnerTube failed for ${videoId}: ${error.message}`);
        return null;
    }
}

// Return YouTube Dislike API로 조회수 가져오기 (빠르고 429 없음)
async function fetchViewCountFromRYD(videoId: string): Promise<number> {
    try {
        const url = `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`;
        const response = await fetch(url);

        if (!response.ok) {
            return 0;
        }

        const data = await response.json();
        return data.viewCount || 0;
    } catch (error) {
        console.error(`[Collect] RYD API error for ${videoId}:`, error);
        return 0;
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

                    // Rate limiting - 영상당 3초 대기 (429 방지)
                    await sleep(3000);
                }
            }

            // 채널간 딜레이 (429 방지)
            await sleep(5000);
        }
    }

    // 기존 영상 조회수 업데이트 (최근 500개만 - RYD API 사용)
    console.log('[Collect] Updating view counts for recent videos using RYD API...');
    const recentVideos = allUpdatedVideos
        .sort((a, b) => b.uploadedAt - a.uploadedAt)
        .slice(0, 500);

    for (const video of recentVideos) {
        // RYD API로 조회수만 빠르게 가져오기
        const viewCount = await fetchViewCountFromRYD(video.id);
        if (viewCount > 0) {
            video.viewCount = viewCount;
            // 바이럴 스코어 재계산
            const hoursAge = Math.max(1, (Date.now() - video.uploadedAt) / (1000 * 60 * 60));
            video.viralScore = Math.round(viewCount / hoursAge);
        }

        // Rate limiting (RYD는 덜 엄격함)
        await sleep(200);
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
