/**
 * Telegram 바이럴 영상 알림 스크립트
 */

import * as fs from 'fs';
import * as path from 'path';

interface Video {
    id: string;
    title: string;
    channelName: string;
    viewCount: number;
    uploadedAt: number;
    url: string;
    viralScore?: number;
    groupId: string;
}

interface VideosData {
    lastUpdated: string | null;
    videos: Video[];
}

const VIDEOS_FILE = path.join(process.cwd(), 'data/videos.json');
const VIRAL_THRESHOLD = parseInt(process.env.VIRAL_THRESHOLD || '500'); // 기본값: 500/h
const TOP_COUNT = parseInt(process.env.TOP_VIRAL_COUNT || '10'); // 상위 10개

/**
 * Telegram으로 메시지 전송
 */
async function sendTelegramMessage(botToken: string, chatId: string, message: string): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: false
        })
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('[Telegram] Send failed:', error);
        throw new Error(`Telegram API error: ${response.status}`);
    }

    console.log('[Telegram] Message sent successfully');
}

/**
 * 바이럴 영상 포맷팅
 */
function formatViralVideos(videos: Video[]): string {
    let message = '🔥 <b>바이럴 영상 알림</b> 🔥\n\n';

    videos.forEach((video, index) => {
        const hoursAgo = Math.floor((Date.now() - video.uploadedAt) / (1000 * 60 * 60));
        const viralScore = video.viralScore || 0;

        message += `${index + 1}. <b>${escapeHtml(video.title)}</b>\n`;
        message += `   📺 ${escapeHtml(video.channelName)}\n`;
        message += `   👁 ${formatNumber(video.viewCount)}회 · 🔥 ${formatNumber(viralScore)}/h\n`;
        message += `   ⏰ ${hoursAgo}시간 전\n`;
        message += `   🔗 <a href="${video.url}">영상 보기</a>\n\n`;
    });

    message += `\n📊 마지막 업데이트: ${new Date().toLocaleString('ko-KR')}`;

    return message;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatNumber(count: number): string {
    if (count >= 100000000) return `${(count / 100000000).toFixed(1)}억`;
    if (count >= 10000) return `${(count / 10000).toFixed(1)}만`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}천`;
    return `${count}`;
}

/**
 * 메인 함수
 */
async function main(): Promise<void> {
    console.log('[Telegram] Checking for viral videos...');

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.log('[Telegram] Bot token or chat ID not configured. Skipping notification.');
        return;
    }

    // 영상 데이터 로드
    if (!fs.existsSync(VIDEOS_FILE)) {
        console.log('[Telegram] No videos.json found. Skipping notification.');
        return;
    }

    const videosData: VideosData = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf-8'));
    const allVideos = videosData.videos || [];

    if (allVideos.length === 0) {
        console.log('[Telegram] No videos found. Skipping notification.');
        return;
    }

    // 바이럴 영상 정렬 (상위 10개, 임계값 무시)
    const viralVideos = allVideos
        .sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0))
        .slice(0, TOP_COUNT);

    if (viralVideos.length === 0) {
        console.log(`[Telegram] No videos found to send`);
        return;
    }

    console.log(`[Telegram] Found ${viralVideos.length} viral videos`);

    // Telegram 메시지 전송
    const message = formatViralVideos(viralVideos);
    await sendTelegramMessage(botToken, chatId, message);

    console.log('[Telegram] Notification sent successfully');
}

// 실행
main().catch(console.error);
