/**
 * InnerTube Rate Limit 테스트 스크립트
 * 다양한 딜레이로 연속 요청하여 언제 차단되는지 확인
 */

import { Innertube } from 'youtubei.js';

// 테스트할 영상 ID들 (실제 존재하는 영상)
const TEST_VIDEO_IDS = [
    'dQw4w9WgXcQ',  // Never Gonna Give You Up
    'jNQXAC9IVRw',  // Me at the zoo
    '9bZkp7q19f0',  // Gangnam Style
    'kJQP7kiw5Fk',  // Despacito
    'RgKAFK5djSk',  // See You Again
    'JGwWNGJdvx8',  // Shape of You
    'OPf0YbXqDm0',  // Uptown Funk
    'CevxZvSJLk8',  // Roar
    'hT_nvWreIhg',  // Counting Stars
    'e-ORhEE9VVg',  // Blank Space
    'pRpeEdMmmQ0',  // Shake It Off
    'YQHsXMglC9A',  // Hello
    '60ItHLz5WEA',  // Alan Walker - Faded
    'kXYiU_JCYtU',  // Numb
    'HP-MbfHFUqs',  // Take Me To Church
    'lp-EO5I60KA',  // Diamonds
    'hLQl3WQQoQ0',  // Someone Like You
    'rYEDA3JcQqw',  // Rolling in the Deep
    'QK8mJJJvaes',  // Lean On
    'fRh_vgS2dFE',  // Sorry
];

interface TestResult {
    delay: number;
    successCount: number;
    failCount: number;
    blockedAt?: number;
    avgResponseTime: number;
    errors: string[];
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWithDelay(delayMs: number, maxRequests: number = 20): Promise<TestResult> {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`테스트 시작: 딜레이 ${delayMs}ms, 최대 ${maxRequests}회`);
    console.log('='.repeat(50));

    const result: TestResult = {
        delay: delayMs,
        successCount: 0,
        failCount: 0,
        avgResponseTime: 0,
        errors: []
    };

    let totalResponseTime = 0;
    let client: Innertube | null = null;

    try {
        console.log('[Init] InnerTube 클라이언트 초기화...');
        client = await Innertube.create();
        console.log('[Init] 초기화 완료');
    } catch (e: any) {
        console.error('[Init] 초기화 실패:', e.message);
        result.errors.push(`Init failed: ${e.message}`);
        return result;
    }

    for (let i = 0; i < maxRequests; i++) {
        const videoId = TEST_VIDEO_IDS[i % TEST_VIDEO_IDS.length];
        const startTime = Date.now();

        try {
            const info = await client.getInfo(videoId);
            const responseTime = Date.now() - startTime;
            totalResponseTime += responseTime;

            const viewCount = info.basic_info?.view_count || 0;
            const duration = info.basic_info?.duration || 0;

            result.successCount++;
            console.log(`[${i + 1}/${maxRequests}] ✅ ${videoId} - ${responseTime}ms - 조회수: ${viewCount}, 길이: ${duration}s`);

        } catch (e: any) {
            const responseTime = Date.now() - startTime;
            result.failCount++;

            const errorMsg = e.message || String(e);
            console.log(`[${i + 1}/${maxRequests}] ❌ ${videoId} - ${responseTime}ms - 에러: ${errorMsg.substring(0, 100)}`);

            // Rate limit 감지
            if (errorMsg.includes('429') || errorMsg.includes('rate') || errorMsg.includes('Too Many')) {
                result.blockedAt = i + 1;
                result.errors.push(`Rate limited at request ${i + 1}: ${errorMsg.substring(0, 100)}`);
                console.log(`\n🚫 Rate Limit 감지! ${i + 1}번째 요청에서 차단됨`);
                break;
            }

            result.errors.push(`Request ${i + 1}: ${errorMsg.substring(0, 100)}`);
        }

        // 딜레이 적용 (마지막 요청 제외)
        if (i < maxRequests - 1) {
            await sleep(delayMs);
        }
    }

    result.avgResponseTime = result.successCount > 0 
        ? Math.round(totalResponseTime / result.successCount) 
        : 0;

    return result;
}

async function runAllTests(): Promise<void> {
    console.log('🧪 InnerTube Rate Limit 테스트 시작');
    console.log(`테스트 시간: ${new Date().toLocaleString('ko-KR')}`);

    const delays = [0, 500, 1000, 2000, 3000, 5000];
    const results: TestResult[] = [];

    for (const delay of delays) {
        // 각 테스트 전 30초 휴식 (이전 테스트 영향 최소화)
        if (results.length > 0) {
            console.log('\n⏳ 다음 테스트 전 30초 대기...\n');
            await sleep(30000);
        }

        const result = await testWithDelay(delay, 20);
        results.push(result);

        // Rate limit 걸리면 더 긴 딜레이 테스트는 스킵
        if (result.blockedAt && result.blockedAt < 5) {
            console.log('\n⚠️ 초반에 차단됨 - IP가 이미 제한 상태일 수 있음');
        }
    }

    // 결과 요약
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 테스트 결과 요약');
    console.log('='.repeat(60));
    console.log('딜레이(ms) | 성공 | 실패 | 차단시점 | 평균응답(ms)');
    console.log('-'.repeat(60));

    for (const r of results) {
        const blockedStr = r.blockedAt ? `${r.blockedAt}번째` : '-';
        console.log(`${r.delay.toString().padStart(10)} | ${r.successCount.toString().padStart(4)} | ${r.failCount.toString().padStart(4)} | ${blockedStr.padStart(8)} | ${r.avgResponseTime.toString().padStart(12)}`);
    }

    console.log('\n📝 권장사항:');
    const safeDelay = results.find(r => r.failCount === 0 && r.successCount >= 15);
    if (safeDelay) {
        console.log(`✅ 안전한 딜레이: ${safeDelay.delay}ms 이상`);
    } else {
        console.log('⚠️ 모든 테스트에서 실패 발생 - 더 긴 딜레이 필요');
    }
}

// 실행
runAllTests().catch(console.error);
