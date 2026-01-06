/**
 * Invidious API 테스트 스크립트
 */

// Invidious public instances (최신 active instances)
const INVIDIOUS_INSTANCES = [
    'https://inv.perditum.com',
    'https://inv.nadeko.net',
    'https://invidious.jing.rocks',
    'https://yewtu.be',
    'https://invidious.lunar.icu'
];

/**
 * Invidious API로 영상 정보 가져오기
 */
async function fetchVideoFromInvidious(videoId, instanceIndex = 0) {
    if (instanceIndex >= INVIDIOUS_INSTANCES.length) {
        console.error('All Invidious instances failed');
        return null;
    }

    const instance = INVIDIOUS_INSTANCES[instanceIndex];
    const url = `${instance}/api/v1/videos/${videoId}`;

    try {
        console.log(`[Invidious] Trying instance: ${instance}`);
        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`[Invidious] Instance ${instance} failed: ${response.status}`);
            // 다음 instance로 retry
            return fetchVideoFromInvidious(videoId, instanceIndex + 1);
        }

        const data = await response.json();
        return {
            viewCount: data.viewCount || 0,
            lengthSeconds: data.lengthSeconds || 0,
            title: data.title || 'Unknown',
            author: data.author || 'Unknown',
            published: data.published || 0
        };
    } catch (error) {
        console.warn(`[Invidious] Instance ${instance} error:`, error.message);
        // 다음 instance로 retry
        return fetchVideoFromInvidious(videoId, instanceIndex + 1);
    }
}

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
 * 테스트 실행
 */
async function test() {
    console.log('=== Invidious API 테스트 시작 ===\n');

    // 테스트용 영상 ID들 (실제 사용자 영상)
    const testVideoIds = [
        '427-VoIETsY'   // YouTube Shorts
    ];

    for (const videoId of testVideoIds) {
        console.log(`\n📹 Testing video: ${videoId}`);
        console.log(`   URL: https://www.youtube.com/watch?v=${videoId}`);

        const data = await fetchVideoFromInvidious(videoId);

        if (data) {
            console.log('✅ Success!');
            console.log(`   Title: ${data.title}`);
            console.log(`   Author: ${data.author}`);
            console.log(`   Views: ${data.viewCount.toLocaleString()}`);
            console.log(`   Duration: ${formatDuration(data.lengthSeconds)}`);
            console.log(`   Published: ${new Date(data.published * 1000).toLocaleDateString()}`);
        } else {
            console.log('❌ Failed to fetch video data');
        }

        // Rate limiting 방지
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n=== 테스트 완료 ===');
}

// 실행
test().catch(console.error);
