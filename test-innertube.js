/**
 * YouTube InnerTube API 테스트 (youtubei.js)
 */

import { Innertube } from 'youtubei.js';

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

/**
 * InnerTube API로 영상 정보 가져오기
 */
async function fetchVideoWithInnerTube(videoId) {
    try {
        console.log(`[InnerTube] Fetching video: ${videoId}...`);

        // Innertube 클라이언트 초기화
        const youtube = await Innertube.create();

        // 영상 정보 가져오기
        const info = await youtube.getInfo(videoId);

        // 기본 정보 추출
        const basicInfo = info.basic_info;

        return {
            id: videoId,
            title: basicInfo.title || 'Unknown',
            channelName: basicInfo.channel?.name || basicInfo.author || 'Unknown',
            channelId: basicInfo.channel?.id || 'Unknown',
            viewCount: parseInt(basicInfo.view_count) || 0,
            likes: parseInt(basicInfo.like_count) || 0,
            duration: basicInfo.duration || 0,
            uploadDate: basicInfo.publish_date || basicInfo.start_timestamp?.text || 'Unknown',
            isShorts: basicInfo.is_short || false,
            thumbnail: basicInfo.thumbnail?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };
    } catch (error) {
        console.error(`[InnerTube] Error fetching video ${videoId}:`, error.message);
        return null;
    }
}

/**
 * 테스트 실행
 */
async function test() {
    console.log('=== YouTube InnerTube API 테스트 시작 ===\n');

    const videoId = '427-VoIETsY';  // YouTube Shorts
    const url = `https://www.youtube.com/shorts/${videoId}`;

    console.log(`📹 Testing video: ${videoId}`);
    console.log(`   URL: ${url}\n`);

    const data = await fetchVideoWithInnerTube(videoId);

    if (data) {
        console.log('✅ Success!\n');
        console.log('📊 Video Data:');
        console.log(`   Title: ${data.title}`);
        console.log(`   Channel: ${data.channelName}`);
        console.log(`   Channel ID: ${data.channelId}`);
        console.log(`   Views: ${data.viewCount.toLocaleString()}`);
        console.log(`   Likes: ${data.likes.toLocaleString()}`);
        console.log(`   Duration: ${formatDuration(data.duration)}`);
        console.log(`   Upload Date: ${data.uploadDate}`);
        console.log(`   Is Shorts: ${data.isShorts ? 'Yes' : 'No'}`);
        console.log(`   Thumbnail: ${data.thumbnail}`);

        // 바이럴 스코어 계산 (예시)
        const hoursAgo = 24; // 임시값
        const viralScore = Math.round(data.viewCount / hoursAgo);
        console.log(`   Viral Score: ${viralScore.toLocaleString()}/h`);
    } else {
        console.log('❌ Failed to fetch video data');
    }

    console.log('\n=== 테스트 완료 ===');
}

// 실행
test().catch(console.error);
