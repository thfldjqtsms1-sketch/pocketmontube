import { useState, useEffect } from 'react';
import { StorageManager } from '../../utils/storage';
import type { Video, Group, SortOption, FilterOption, VideoLimitOption } from '../../types';

interface VideoListProps {
    group: Group;
    onBack: () => void;
}

export default function VideoList({ group, onBack }: VideoListProps) {
    const [videos, setVideos] = useState<Video[]>([]);
    const [sortBy, setSortBy] = useState<SortOption>('date');
    const [filterBy, setFilterBy] = useState<FilterOption>('all');
    const [videoLimit, setVideoLimit] = useState<VideoLimitOption>(300);
    const [isCollecting, setIsCollecting] = useState(false);
    const [savedVideos, setSavedVideos] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadSettings();
        loadSavedVideos();
    }, []);

    useEffect(() => {
        loadVideos();
    }, [group.id, sortBy, filterBy, videoLimit]);

    const loadSettings = async () => {
        const settings = await StorageManager.getSettings();
        setVideoLimit((settings.maxVideosPerChannel || 300) as VideoLimitOption);
    };

    const loadSavedVideos = async () => {
        const saved = await StorageManager.getSavedVideos();
        setSavedVideos(saved);
    };

    const loadVideos = async () => {
        let loadedVideos = await StorageManager.getFilteredVideos(group.id, filterBy);

        // 정렬
        if (sortBy === 'date') {
            loadedVideos.sort((a, b) => b.uploadedAt - a.uploadedAt);
        } else if (sortBy === 'oldest') {
            loadedVideos.sort((a, b) => a.uploadedAt - b.uploadedAt);
        } else if (sortBy === 'views') {
            loadedVideos.sort((a, b) => b.viewCount - a.viewCount);
        } else if (sortBy === 'viral') {
            loadedVideos.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
        }

        // 개수 제한 적용
        loadedVideos = loadedVideos.slice(0, videoLimit);

        setVideos(loadedVideos);
    };

    const handleCollect = async () => {
        setIsCollecting(true);
        try {
            await chrome.runtime.sendMessage({
                type: 'COLLECT_GROUP_VIDEOS',
                groupId: group.id
            });
            // 수집 후 영상 다시 로드
            await loadVideos();
        } catch (error) {
            console.error('Failed to collect videos:', error);
        }
        setIsCollecting(false);
    };

    const openVideo = (url: string, videoId: string) => {
        // 시청 상태 업데이트
        StorageManager.markVideoAsWatched(videoId, true);
        chrome.tabs.create({ url });
    };

    const toggleSaved = async (e: React.MouseEvent, videoId: string) => {
        e.stopPropagation();
        const isSaved = await StorageManager.toggleSavedVideo(videoId);
        await loadSavedVideos();
        return isSaved;
    };

    const formatViewCount = (count: number): string => {
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return `${count}`;
    };

    const formatTimeAgo = (timestamp: number): string => {
        const now = Date.now();
        const diff = now - timestamp;

        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        const week = 7 * day;
        const month = 30 * day;

        if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
        if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
        if (diff < week) return `${Math.floor(diff / day)}일 전`;
        if (diff < month) return `${Math.floor(diff / week)}주 전`;
        return `${Math.floor(diff / month)}개월 전`;
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                <div className="flex items-center gap-3 mb-3">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <span>{group.icon || '📁'}</span>
                            {group.name}
                        </h2>
                        <p className="text-sm text-gray-400">{videos.length}개 동영상</p>
                    </div>
                    <button
                        onClick={handleCollect}
                        disabled={isCollecting}
                        className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${isCollecting
                            ? 'bg-gray-600 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700'
                            }`}
                    >
                        {isCollecting ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                수집 중...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                영상 수집
                            </>
                        )}
                    </button>
                </div>

                {/* Filters */}
                <div className="flex gap-2 flex-wrap">
                    <select
                        value={videoLimit}
                        onChange={async (e) => {
                            const limit = parseInt(e.target.value) as VideoLimitOption;
                            setVideoLimit(limit);
                            await StorageManager.updateSettings({ maxVideosPerChannel: limit });
                        }}
                        className="bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-red-500"
                    >
                        <option value="100">100개</option>
                        <option value="300">300개</option>
                        <option value="500">500개</option>
                        <option value="800">800개</option>
                    </select>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-red-500"
                    >
                        <option value="date">최신순</option>
                        <option value="oldest">오래된순</option>
                        <option value="views">조회수순</option>
                        <option value="viral">바이럴순</option>
                    </select>
                    <select
                        value={filterBy}
                        onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                        className="bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-red-500"
                    >
                        <option value="all">모든 동영상</option>
                        <option value="unwatched">시청하지 않음</option>
                        <option value="saved">⭐ 저장된 영상</option>
                    </select>
                </div>
            </div>

            {/* Video List */}
            <div className="flex-1 overflow-y-auto p-4">
                {videos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <p className="text-gray-400 mb-2">아직 영상이 없습니다</p>
                        <p className="text-gray-500 text-sm mb-4">채널을 추가하고 '영상 수집' 버튼을 눌러주세요</p>
                        {group.channels.length > 0 && (
                            <button
                                onClick={handleCollect}
                                disabled={isCollecting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                            >
                                지금 영상 수집하기
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {videos.map(video => (
                            <div key={video.id} className="relative">
                                <button
                                    onClick={() => openVideo(video.url, video.id)}
                                    className="w-full flex gap-3 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-left group"
                                >
                                    {/* Thumbnail */}
                                    <div className="relative flex-shrink-0 w-32 aspect-video bg-gray-900 rounded overflow-hidden">
                                        <img
                                            src={video.thumbnail}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">
                                            {video.duration}
                                        </span>
                                        {video.watched && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-sm line-clamp-2 group-hover:text-red-400 transition-colors">
                                            {video.title}
                                        </h3>
                                        <p className="text-xs text-gray-400 mt-1">{video.channelName}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            조회수 {formatViewCount(video.viewCount)}회 • {formatTimeAgo(video.uploadedAt)}
                                        </p>
                                    </div>
                                </button>
                                {/* Save Button */}
                                <button
                                    onClick={(e) => toggleSaved(e, video.id)}
                                    className="absolute top-2 right-2 p-2 rounded-lg bg-gray-900/80 hover:bg-yellow-600 transition-colors z-10"
                                    title={savedVideos.has(video.id) ? "저장 취소" : "영상 저장"}
                                >
                                    <svg className="w-4 h-4" fill={savedVideos.has(video.id) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
