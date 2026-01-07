/**
 * GitHub Actions용 YouTube 영상 수집 스크립트
 * YouTube InnerTube API 사용 (youtubei.js)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Innertube } from 'youtubei.js';

// youtubei.js 파서 경고 숨기기 (쇼핑 위젯 등 불필요한 경고)
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
    const msg = args[0]?.toString() || '';
    if (msg.includes('[YOUTUBEJS]') || msg.includes('Parser')) {
        return; // 무시
    }
    originalWarn.apply(console, args);
};

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
const CHECKPOINT_FILE = path.join(DATA_DIR, 'collect-checkpoint.json');

// 배치 설정: 한 번에 처리할 채널 수 (환경변수로 조절 가능)
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');

// 체크포인트 인터페이스
interface Checkpoint {
    lastGroupIndex: number;
    lastChannelIndex: number;
    collectedVideos: Video[];
    startedAt: string;
}

// 체크포인트 저장
function saveCheckpoint(checkpoint: Checkpoint): void {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
    console.log(`[Checkpoint] Saved: group ${checkpoint.lastGroupIndex}, channel ${checkpoint.lastChannelIndex}, videos ${checkpoint.collectedVideos.length}`);
}

// 체크포인트 로드
function loadCheckpoint(): Checkpoint | null {
    if (fs.existsSync(CHECKPOINT_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
            console.log(`[Checkpoint] Loaded: group ${data.lastGroupIndex}, channel ${data.lastChannelIndex}, videos ${data.collectedVideos?.length || 0}`);
            return data;
        } catch {
            console.log('[Checkpoint] Failed to load checkpoint, starting fresh');
        }
    }
    return null;
}

// 체크포인트 삭제 (완료 시)
function clearCheckpoint(): void {
    if (fs.existsSync(CHECKPOINT_FILE)) {
        fs.unlinkSync(CHECKPOINT_FILE);
        console.log('[Checkpoint] Cleared');
    }
}

// InnerTube 클라이언트 (전역)
let youtubeClient: Innertube | null = null;

// ============================================
// 에러 로그 시스템
// ============================================
interface CollectError {
    timestamp: string;
    type: 'video' | 'channel' | 'rss';
    id: string;
    name: string;
    error: string;
    attempts: number;
}

interface CollectStats {
    startedAt: string;
    lastUpdated: string;
    channelsProcessed: number;
    channelsTotal: number;
    videosCollected: number;
    videosUpdated: number;
    errors: number;
    retries: number;
}

const ERRORS_FILE = path.join(DATA_DIR, 'collect-errors.json');
const STATS_FILE = path.join(DATA_DIR, 'collect-stats.json');

// 수집 통계 (런타임)
let collectStats: CollectStats = {
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    channelsProcessed: 0,
    channelsTotal: 0,
    videosCollected: 0,
    videosUpdated: 0,
    errors: 0,
    retries: 0
};

function logCollectError(
    id: string, 
    name: string, 
    error: Error | null, 
    attempts: number, 
    type: 'video' | 'channel' | 'rss' = 'video'
): void {
    try {
        const errorLog: CollectError = {
            timestamp: new Date().toISOString(),
            type,
            id,
            name,
            error: error?.message?.substring(0, 200) || 'Unknown error',
            attempts
        };

        let errors: CollectError[] = [];
        if (fs.existsSync(ERRORS_FILE)) {
            try {
                errors = JSON.parse(fs.readFileSync(ERRORS_FILE, 'utf-8'));
            } catch {
                errors = [];
            }
        }
        
        errors.push(errorLog);
        // 최근 500개만 유지
        errors = errors.slice(-500);
        fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));
        
        collectStats.errors++;
        console.log(`[ErrorLog] Saved: ${type} ${id} (${name}) - ${errorLog.error.substring(0, 50)}`);
    } catch (e) {
        console.error('[ErrorLog] Failed to save error log:', e);
    }
}

function saveStats(): void {
    try {
        collectStats.lastUpdated = new Date().toISOString();
        fs.writeFileSync(STATS_FILE, JSON.stringify(collectStats, null, 2));
    } catch (e) {
        console.error('[Stats] Failed to save stats:', e);
    }
}

function logProgress(message: string): void {
    const timestamp = new Date().toISOString().substring(11, 19); // HH:MM:SS
    console.log(`[${timestamp}] ${message}`);
}

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

// ============================================
// 영상 상세 정보 수집 (재시도 로직 포함)
// ============================================
async function fetchVideoDetails(
    videoId: string, 
    channelName: string = 'Unknown',
    maxRetries: number = 2
): Promise<{ viewCount: number; duration: string; isShorts: boolean } | null> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            // InnerTube 클라이언트 초기화 (처음 한 번 또는 재생성 필요시)
            if (!youtubeClient) {
                logProgress(`[InnerTube] Initializing client...`);
                youtubeClient = await Innertube.create();
                logProgress(`[InnerTube] Client ready`);
            }

            const info = await youtubeClient.getInfo(videoId);
            const basicInfo = info.basic_info;

            const viewCount = parseInt(basicInfo.view_count as any) || 0;
            const totalSeconds = basicInfo.duration || 0;
            const duration = formatDuration(totalSeconds);
            const isShorts = (basicInfo as any).is_short || totalSeconds < 180;

            // viewCount=0이고 재시도 가능하면 재시도
            // (신규 영상이 아닌 이상 viewCount=0은 API 문제일 가능성 높음)
            if (viewCount === 0 && attempt <= maxRetries) {
                const delay = 30000 * attempt; // 30초, 60초
                collectStats.retries++;
                logProgress(`[Retry] ${videoId} viewCount=0, attempt ${attempt}/${maxRetries+1}, waiting ${delay/1000}s...`);
                await sleep(delay);
                continue;
            }

            // 성공 로그 (재시도 후 성공한 경우)
            if (attempt > 1) {
                logProgress(`[Success] ${videoId} succeeded on attempt ${attempt} - views: ${viewCount}`);
            }

            return { viewCount, duration, isShorts };
            
        } catch (error: any) {
            lastError = error;
            const errorMsg = error.message || String(error);
            const shortError = errorMsg.substring(0, 80);
            
            console.error(`[Error] ${videoId} attempt ${attempt}/${maxRetries+1}: ${shortError}`);

            if (attempt <= maxRetries) {
                collectStats.retries++;
                
                // 429 (Rate Limit) 에러 감지
                const is429 = errorMsg.includes('429') || 
                              errorMsg.includes('rate') || 
                              errorMsg.includes('Too Many');
                
                if (is429) {
                    const delay = 60000 * attempt; // 60초, 120초
                    logProgress(`[RateLimit] 429 detected! Waiting ${delay/1000}s, recreating client...`);
                    youtubeClient = null; // 클라이언트 재생성
                    await sleep(delay);
                } else {
                    const delay = 30000 * attempt; // 30초, 60초
                    logProgress(`[Retry] Waiting ${delay/1000}s before retry...`);
                    await sleep(delay);
                }
            }
        }
    }

    // 모든 재시도 실패
    logCollectError(videoId, channelName, lastError, maxRetries + 1, 'video');
    logProgress(`[Failed] ${videoId} (${channelName}) after ${maxRetries + 1} attempts - will retry next cycle`);
    
    return null;
}


// 메인 수집 함수
async function collectVideos(): Promise<void> {
    console.log('='.repeat(60));
    logProgress('[Collect] Starting video collection...');
    logProgress(`[Collect] Working directory: ${process.cwd()}`);
    logProgress(`[Collect] Batch size: ${BATCH_SIZE} channels`);
    console.log('='.repeat(60));

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

    // 체크포인트 로드 (이전에 중단된 지점에서 재개)
    const checkpoint = loadCheckpoint();
    let startGroupIndex = 0;
    let startChannelIndex = 0;
    let allNewVideos: Video[] = [];

    if (checkpoint) {
        startGroupIndex = checkpoint.lastGroupIndex;
        startChannelIndex = checkpoint.lastChannelIndex + 1; // 마지막 완료된 채널 다음부터
        allNewVideos = checkpoint.collectedVideos || [];

        // 체크포인트에서 이미 수집한 영상 ID도 existingIds에 추가
        for (const v of allNewVideos) {
            existingIds.add(v.id);
        }

        console.log(`[Collect] Resuming from group ${startGroupIndex}, channel ${startChannelIndex}`);
        console.log(`[Collect] Already collected ${allNewVideos.length} new videos from previous run`);
    }

    const allUpdatedVideos: Video[] = [...existingVideos];

    // 배치 처리를 위한 채널 카운터
    let processedChannels = 0;
    let batchComplete = false;

    console.log(`[Collect] Batch size: ${BATCH_SIZE} channels per run`);

    // 모든 그룹의 채널에서 영상 수집
    for (let groupIndex = startGroupIndex; groupIndex < channelsData.groups.length && !batchComplete; groupIndex++) {
        const group = channelsData.groups[groupIndex];
        console.log(`[Collect] Processing group: ${group.name} (${group.channels.length} channels)`);

        // 첫 그룹은 체크포인트 위치부터, 이후 그룹은 0부터
        const channelStartIndex = (groupIndex === startGroupIndex) ? startChannelIndex : 0;

        for (let channelIndex = channelStartIndex; channelIndex < group.channels.length && !batchComplete; channelIndex++) {
            const channel = group.channels[channelIndex];

            try {
                // RSS로 영상 목록 수집
                const rssVideos = await fetchRSSVideos(channel, group.id);

                // 새 영상만 필터링
                const newVideos = rssVideos.filter(v => !existingIds.has(v.id));

                if (newVideos.length > 0) {
                    console.log(`[Collect] ${newVideos.length} new videos from ${channel.name}`);

                    // 새 영상들의 상세 정보 수집
                    for (const video of newVideos) {
                        const details = await fetchVideoDetails(video.id, channel.name);
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

                        collectStats.videosCollected++;
                        
                        // Rate limiting - 영상당 5초 대기 (429 방지)
                        await sleep(5000);
                    }
                }

                // 채널 완료 후 체크포인트 저장
                processedChannels++;
                collectStats.channelsProcessed++;
                saveCheckpoint({
                    lastGroupIndex: groupIndex,
                    lastChannelIndex: channelIndex,
                    collectedVideos: allNewVideos,
                    startedAt: checkpoint?.startedAt || new Date().toISOString()
                });

                // 10개마다 상세 진행 상황 로그 출력
                if (processedChannels % 10 === 0 || processedChannels === 1) {
                    const elapsed = Math.round((Date.now() - new Date(collectStats.startedAt).getTime()) / 1000);
                    const progress = `${processedChannels}/${BATCH_SIZE} channels`;
                    const stats = `new: ${allNewVideos.length}, errors: ${collectStats.errors}, retries: ${collectStats.retries}`;
                    logProgress(`[Progress] ${progress} | ${stats} | elapsed: ${elapsed}s`);
                    saveStats();
                }

                // 채널간 딜레이 (429 방지) - 10초로 증가
                await sleep(10000);

            } catch (error: any) {
                const errorMsg = error.message || String(error);
                console.error(`[ChannelError] ${channel.name} (${channel.id}): ${errorMsg.substring(0, 100)}`);
                
                // 에러 로그 저장
                logCollectError(channel.id, channel.name, error, 0, 'channel');

                // 체크포인트 저장 (현재 채널까지 시도한 것으로)
                saveCheckpoint({
                    lastGroupIndex: groupIndex,
                    lastChannelIndex: channelIndex,
                    collectedVideos: allNewVideos,
                    startedAt: checkpoint?.startedAt || new Date().toISOString()
                });

                // 429 에러면 더 긴 대기
                const is429 = errorMsg.includes('429') || errorMsg.includes('rate') || errorMsg.includes('Too Many');
                const waitTime = is429 ? 60000 : 30000;
                
                logProgress(`[Recovery] Waiting ${waitTime/1000}s before next channel...`);
                await sleep(waitTime);
                
                // 429면 클라이언트 재생성
                if (is429) {
                    youtubeClient = null;
                }
                
                continue;  // throw error 대신 continue - 다음 채널로
            }
        }
    }

    // 모든 채널 수집 완료 여부 확인
    const allChannelsProcessed = !batchComplete;

    // 기존 영상 조회수 업데이트 (viewCount=0 또는 duration=0:00인 영상 우선)
    console.log('[Collect] Updating view counts for existing videos...');

    // 업데이트가 필요한 영상: viewCount=0 또는 duration="0:00"
    const videosNeedingUpdate = allUpdatedVideos.filter(v =>
        v.viewCount === 0 || v.duration === '0:00' || !v.duration
    );

    // 바이럴 스코어 재계산이 필요한 영상 (최근 7일 이내 영상)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentVideos = allUpdatedVideos.filter(v =>
        v.uploadedAt > sevenDaysAgo && v.viewCount > 0
    );

    // 복합: 먼저 viewCount=0인 것, 그다음 최근 영상
    const updateCandidates = [
        ...videosNeedingUpdate,
        ...recentVideos.filter(v => !videosNeedingUpdate.includes(v))
    ];

    // 최대 100개만 업데이트 (rate limit 방지)
    const MAX_UPDATE_COUNT = 100;
    const toUpdate = updateCandidates.slice(0, MAX_UPDATE_COUNT);

    console.log(`[Collect] Found ${videosNeedingUpdate.length} videos needing update, ${recentVideos.length} recent videos`);
    console.log(`[Collect] Will update ${toUpdate.length} videos this run`);

    let updatedCount = 0;
    for (const video of toUpdate) {
        const details = await fetchVideoDetails(video.id, video.channelName);
        if (details && details.viewCount > 0) {
            video.viewCount = details.viewCount;
            video.duration = details.duration;
            video.isShorts = details.isShorts;
            if (details.isShorts) {
                video.url = `https://www.youtube.com/shorts/${video.id}`;
            }
            // 바이럴 스코어 재계산
            const hoursAge = Math.max(1, (Date.now() - video.uploadedAt) / (1000 * 60 * 60));
            video.viralScore = Math.round(video.viewCount / hoursAge);
            updatedCount++;
            collectStats.videosUpdated++;
        }
        // Rate limiting - 5초로 증가
        await sleep(5000);
    }

    console.log(`[Collect] Updated ${updatedCount} existing videos`);

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

    // 모든 채널 처리 완료 시에만 체크포인트 삭제
    if (allChannelsProcessed) {
        clearCheckpoint();
        logProgress(`[Complete] Full cycle complete! Telegram notification will be sent.`);
    } else {
        logProgress(`[Batch] Batch complete. Will continue from checkpoint next run.`);
    }

    // 전체 채널 수 계산
    const totalChannels = channelsData.groups.reduce((sum, g) => sum + g.channels.length, 0);

    // 최종 요약 출력
    console.log('='.repeat(60));
    logProgress(`[Summary] Channels processed: ${processedChannels}/${totalChannels}`);
    logProgress(`[Summary] New videos: ${allNewVideos.length}`);
    logProgress(`[Summary] Updated videos: ${updatedCount}`);
    logProgress(`[Summary] Total videos: ${limitedVideos.length}`);
    logProgress(`[Summary] Errors: ${collectStats.errors}`);
    logProgress(`[Summary] Retries: ${collectStats.retries}`);
    logProgress(`[Summary] Last updated: ${result.lastUpdated}`);
    console.log('='.repeat(60));
    
    saveStats();
}

// 실행
collectVideos().catch(console.error);
