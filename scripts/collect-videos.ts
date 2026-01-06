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

// 수집 진행 상황 텔레그램 보고
async function sendCollectionReport(stats: {
    processedChannels: number;
    totalChannels: number;
    newVideos: number;
    totalVideos: number;
    isFullCycle: boolean;
    batchSize: number;
}): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.log('[Telegram] Bot token or chat ID not configured. Skipping collection report.');
        return;
    }

    const now = new Date();
    const timeStr = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const remainingChannels = stats.totalChannels - stats.processedChannels;
    const progress = Math.round((stats.processedChannels / stats.totalChannels) * 100);

    let message = '📊 <b>영상 수집 보고</b>\n';
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 ${timeStr}\n\n`;

    if (stats.isFullCycle) {
        message += `✅ <b>전체 사이클 완료!</b>\n\n`;
    } else {
        message += `🔄 <b>배치 수집 완료</b>\n\n`;
    }

    message += `📺 처리한 채널: ${stats.processedChannels}/${stats.totalChannels} (${progress}%)\n`;
    message += `🆕 새 영상: ${stats.newVideos}개\n`;
    message += `📁 전체 영상: ${stats.totalVideos}개\n`;

    if (!stats.isFullCycle) {
        message += `\n⏳ 남은 채널: ${remainingChannels}개\n`;
        message += `📌 다음 실행 시 이어서 수집\n`;
    }

    message += `\n💡 배치 크기: ${stats.batchSize}채널/시간`;

    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });

        if (response.ok) {
            console.log('[Telegram] Collection report sent successfully');
        } else {
            console.warn('[Telegram] Failed to send collection report:', await response.text());
        }
    } catch (error) {
        console.error('[Telegram] Error sending collection report:', error);
    }
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

                // 채널 완료 후 체크포인트 저장
                processedChannels++;
                saveCheckpoint({
                    lastGroupIndex: groupIndex,
                    lastChannelIndex: channelIndex,
                    collectedVideos: allNewVideos,
                    startedAt: checkpoint?.startedAt || new Date().toISOString()
                });

                console.log(`[Collect] Progress: ${processedChannels}/${BATCH_SIZE} channels this batch`);

                // 배치 크기에 도달하면 중단
                if (processedChannels >= BATCH_SIZE) {
                    console.log(`[Collect] Batch limit reached (${BATCH_SIZE} channels). Saving and exiting...`);
                    batchComplete = true;
                    break;
                }

                // 채널간 딜레이 (429 방지)
                await sleep(5000);

            } catch (error) {
                console.error(`[Collect] Error processing channel ${channel.name}:`, error);

                // 에러 발생 시에도 현재까지의 진행 상황 저장
                saveCheckpoint({
                    lastGroupIndex: groupIndex,
                    lastChannelIndex: channelIndex - 1, // 실패한 채널 전까지
                    collectedVideos: allNewVideos,
                    startedAt: checkpoint?.startedAt || new Date().toISOString()
                });

                // 에러를 다시 throw하여 프로세스 종료
                throw error;
            }
        }
    }

    // 모든 채널 수집 완료 여부 확인
    const allChannelsProcessed = !batchComplete;

    // 기존 영상 조회수는 InnerTube API만 사용 (새 영상 수집 시에만 업데이트)
    console.log('[Collect] Skipping bulk view count update (only new videos updated)');

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
        console.log(`[Collect] Full cycle complete!`);
    } else {
        console.log(`[Collect] Batch complete! Will continue from checkpoint next run.`);
    }

    // 전체 채널 수 계산
    const totalChannels = channelsData.groups.reduce((sum, g) => sum + g.channels.length, 0);

    // 텔레그램으로 수집 보고 전송 (매 배치마다)
    await sendCollectionReport({
        processedChannels,
        totalChannels,
        newVideos: allNewVideos.length,
        totalVideos: limitedVideos.length,
        isFullCycle: allChannelsProcessed,
        batchSize: BATCH_SIZE
    });

    console.log(`[Collect] Channels processed this batch: ${processedChannels}`);
    console.log(`[Collect] New videos: ${allNewVideos.length}`);
    console.log(`[Collect] Total videos: ${limitedVideos.length}`);
    console.log(`[Collect] Last updated: ${result.lastUpdated}`);
}

// 실행
collectVideos().catch(console.error);
