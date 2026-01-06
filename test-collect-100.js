/**
 * InnerTube API로 100개 영상 수집 테스트
 */

import { Innertube } from 'youtubei.js';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const TEST_LIMIT = 100; // 100개만 테스트

let youtubeClient = null;

/**
 * Duration 포맷팅
 */
function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * RSS 피드에서 영상 목록 가져오기
 */
async function fetchRSSVideos(channel, groupId) {
    const videos = [];

    try {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
        console.log(`[RSS] Fetching ${channel.name}...`);

        const response = await fetch(rssUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            console.warn(`[RSS] Failed for ${channel.name}: ${response.status}`);
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

        console.log(`[RSS] Found ${videos.length} videos from ${channel.name}`);
    } catch (error) {
        console.error(`[RSS] Error for ${channel.name}:`, error.message);
    }

    return videos;
}

/**
 * InnerTube API로 영상 상세 정보 가져오기
 */
async function fetchVideoDetailsWithInnerTube(videoId) {
    try {
        // 클라이언트 초기화 (처음 한 번만)
        if (!youtubeClient) {
            console.log('[InnerTube] Initializing client...');
            youtubeClient = await Innertube.create();
        }

        const info = await youtubeClient.getInfo(videoId);
        const basicInfo = info.basic_info;

        const viewCount = parseInt(basicInfo.view_count) || 0;
        const duration = basicInfo.duration || 0;
        const isShorts = basicInfo.is_short || duration < 180;

        return {
            viewCount,
            duration,
            isShorts
        };
    } catch (error) {
        console.warn(`[InnerTube] Failed for ${videoId}: ${error.message}`);
        return null;
    }
}

/**
 * 테스트 수집
 */
async function testCollect() {
    console.log('=== InnerTube API 100개 수집 테스트 시작 ===\n');

    // 채널 목록 로드
    if (!fs.existsSync(CHANNELS_FILE)) {
        console.log('[Test] No channels.json found');
        return;
    }

    const channelsData = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));

    if (channelsData.groups.length === 0) {
        console.log('[Test] No groups found');
        return;
    }

    // RSS로 영상 목록 수집
    console.log('[Test] Collecting video list from RSS...\n');
    const allVideos = [];

    for (const group of channelsData.groups) {
        if (allVideos.length >= TEST_LIMIT) break;

        for (const channel of group.channels) {
            if (allVideos.length >= TEST_LIMIT) break;

            const videos = await fetchRSSVideos(channel, group.id);
            allVideos.push(...videos);

            await sleep(2000); // 채널 간 딜레이
        }
    }

    // 100개로 제한
    const testVideos = allVideos.slice(0, TEST_LIMIT);
    console.log(`\n[Test] Total videos to test: ${testVideos.length}\n`);

    // InnerTube로 상세 정보 수집
    console.log('[Test] Fetching details with InnerTube API...\n');
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < testVideos.length; i++) {
        const video = testVideos[i];
        console.log(`[${i + 1}/${testVideos.length}] ${video.title.substring(0, 50)}...`);

        const details = await fetchVideoDetailsWithInnerTube(video.id);

        if (details) {
            video.viewCount = details.viewCount;
            video.duration = formatDuration(details.duration);
            video.isShorts = details.isShorts;
            if (details.isShorts) {
                video.url = `https://www.youtube.com/shorts/${video.id}`;
            }

            // 바이럴 스코어 계산
            const hoursAge = Math.max(1, (Date.now() - video.uploadedAt) / (1000 * 60 * 60));
            video.viralScore = Math.round(video.viewCount / hoursAge);

            console.log(`   ✅ Views: ${video.viewCount.toLocaleString()} | Duration: ${video.duration} | Viral: ${video.viralScore.toLocaleString()}/h`);
            successCount++;
        } else {
            console.log(`   ❌ Failed`);
            failCount++;
        }

        // Rate limiting - 1초 대기
        await sleep(1000);
    }

    // 결과 요약
    console.log('\n=== 테스트 완료 ===');
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📊 Success Rate: ${((successCount / testVideos.length) * 100).toFixed(1)}%`);

    // 상위 10개 바이럴 영상
    const topViral = testVideos
        .filter(v => v.viralScore > 0)
        .sort((a, b) => b.viralScore - a.viralScore)
        .slice(0, 10);

    console.log('\n🔥 Top 10 Viral Videos:');
    topViral.forEach((video, index) => {
        console.log(`${index + 1}. ${video.title}`);
        console.log(`   👁 ${video.viewCount.toLocaleString()} views | 🔥 ${video.viralScore.toLocaleString()}/h`);
    });
}

// 실행
testCollect().catch(console.error);
