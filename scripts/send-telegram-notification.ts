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
    duration?: string;
    thumbnail?: string;
}

interface VideosData {
    lastUpdated: string | null;
    videos: Video[];
}

interface Group {
    id: string;
    name: string;
    icon?: string;
}

interface ChannelsData {
    groups: Group[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
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
 * 바이럴 영상 포맷팅 (폴더별 표 형식)
 */
function formatViralVideosByGroup(videosByGroup: Map<string, { group: Group; videos: Video[] }>): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    let message = '📊 <b>바이럴 영상 랭킹 보고서</b> 📊\n';
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 ${dateStr} ${timeStr}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    let totalVideos = 0;

    // 그룹별로 표 형식 출력
    for (const [groupId, { group, videos }] of videosByGroup) {
        if (videos.length === 0) continue;

        const icon = group.icon || '📁';
        message += `${icon} <b>${escapeHtml(group.name)}</b>\n`;
        message += `┌─────┬────────────────────┬──────────┐\n`;
        message += `│ 순위 │ 조회수              │ 바이럴    │\n`;
        message += `├─────┼────────────────────┼──────────┤\n`;

        videos.slice(0, 5).forEach((video, index) => {
            const viralScore = video.viralScore || 0;
            const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ` ${index + 1} `;
            const views = formatNumber(video.viewCount).padStart(8);
            const viral = formatNumber(viralScore).padStart(6);

            message += `│ ${rank} │ ${views}회      │ ${viral}/h │\n`;

            // 제목 (최대 30자)
            const title = video.title.length > 30
                ? video.title.substring(0, 27) + '...'
                : video.title;
            message += `│     │ ${escapeHtml(title)}\n`;
            message += `│     │ <a href="${video.url}">🔗 링크</a>\n`;

            if (index < Math.min(4, videos.length - 1)) {
                message += `├─────┼────────────────────┼──────────┤\n`;
            }
        });

        message += `└─────┴────────────────────┴──────────┘\n`;
        message += `📈 총 ${videos.length}개 영상\n\n`;

        totalVideos += videos.length;
    }

    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `✨ 전체 ${totalVideos}개 영상\n`;
    message += `💡 매시간 자동 업데이트\n`;
    message += `🤖 PocketMonTube`;

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

    // 그룹 데이터 로드
    if (!fs.existsSync(CHANNELS_FILE)) {
        console.log('[Telegram] No channels.json found. Skipping notification.');
        return;
    }

    const channelsData: ChannelsData = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));
    const groups = channelsData.groups || [];

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

    // 그룹별로 영상 분류 및 정렬 (바이럴 스코어 기준)
    const videosByGroup = new Map<string, { group: Group; videos: Video[] }>();

    for (const group of groups) {
        const groupVideos = allVideos
            .filter(v => v.groupId === group.id)
            .sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));

        if (groupVideos.length > 0) {
            videosByGroup.set(group.id, { group, videos: groupVideos });
        }
    }

    if (videosByGroup.size === 0) {
        console.log('[Telegram] No videos found to send');
        return;
    }

    console.log(`[Telegram] Found ${videosByGroup.size} groups with videos`);

    // Telegram 메시지 전송
    const message = formatViralVideosByGroup(videosByGroup);
    await sendTelegramMessage(botToken, chatId, message);

    console.log('[Telegram] Notification sent successfully');
}

// 실행
main().catch(console.error);
