import { useState, useEffect } from 'react';
import { StorageManager } from '../../utils/storage';
import { ApiUsageTracker } from '../../utils/youtube-api';
import { GitHubSync } from '../../utils/github-sync';
import type { Settings, ApiUsage, DataSource } from '../../types';

interface SettingsProps {
    onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsProps) {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [githubTokenInput, setGithubTokenInput] = useState('');
    const [githubRepoInput, setGithubRepoInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [validatingGithub, setValidatingGithub] = useState(false);
    const [githubValid, setGithubValid] = useState<boolean | null>(null);

    useEffect(() => {
        loadSettings();
        loadApiUsage();
    }, []);

    const loadSettings = async () => {
        const loaded = await StorageManager.getSettings();
        setSettings(loaded);
        setApiKeyInput(loaded.youtubeApiKey || '');
        setGithubTokenInput(loaded.githubToken || '');
        setGithubRepoInput(loaded.githubRepo || '');
    };

    const loadApiUsage = async () => {
        const usage = await ApiUsageTracker.getUsage();
        setApiUsage(usage);
    };

    const handleSave = async () => {
        if (!settings) return;
        setSaving(true);

        const updated = {
            ...settings,
            youtubeApiKey: apiKeyInput,
            githubToken: githubTokenInput,
            githubRepo: githubRepoInput
        };

        await StorageManager.updateSettings(updated);
        setSettings(updated);
        setSaving(false);
    };

    const handleValidateGitHub = async () => {
        if (!githubTokenInput || !githubRepoInput) return;

        setValidatingGithub(true);
        const isValid = await GitHubSync.validateToken(githubTokenInput, githubRepoInput);
        setGithubValid(isValid);
        setValidatingGithub(false);

        if (isValid) {
            // 유효하면 자동으로 저장
            await handleSave();
        }
    };

    const handleToggleAutoSync = async (enabled: boolean) => {
        if (!settings) return;

        const updated = { ...settings, autoSyncChannels: enabled };
        setSettings(updated);
        await StorageManager.updateSettings(updated);
    };

    const handleDataSourceChange = async (source: DataSource) => {
        if (!settings) return;

        const updated = { ...settings, dataSource: source };
        setSettings(updated);
        await StorageManager.updateSettings(updated);
    };

    if (!settings) {
        return (
            <div className="p-4 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full mx-auto"></div>
            </div>
        );
    }

    const usagePercent = apiUsage ? ApiUsageTracker.getUsagePercent(apiUsage) : 0;
    const usageColor = apiUsage ? ApiUsageTracker.getUsageColor(apiUsage) : '#22c55e';

    return (
        <div className="p-4 space-y-6">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">설정</h2>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-700 rounded-full transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* 데이터 소스 선택 */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400">데이터 수집 방식</h3>

                <label className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
                    <input
                        type="radio"
                        name="dataSource"
                        checked={settings.dataSource === 'html'}
                        onChange={() => handleDataSourceChange('html')}
                        className="w-4 h-4 text-red-500"
                    />
                    <div>
                        <div className="font-medium">HTML 스크래핑</div>
                        <div className="text-xs text-gray-400">기존 방식, API 키 불필요</div>
                    </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
                    <input
                        type="radio"
                        name="dataSource"
                        checked={settings.dataSource === 'youtube_api'}
                        onChange={() => handleDataSourceChange('youtube_api')}
                        className="w-4 h-4 text-red-500"
                    />
                    <div>
                        <div className="font-medium">YouTube 공식 API</div>
                        <div className="text-xs text-gray-400">빠르고 정확함, API 키 필요</div>
                    </div>
                </label>
            </div>

            {/* YouTube API 설정 (API 선택 시) */}
            {settings.dataSource === 'youtube_api' && (
                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-400">YouTube API 키</h3>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="AIzaSy..."
                            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-red-500"
                        />
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {saving ? '저장 중...' : '저장'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">
                        * Google Cloud Console에서 API 키를 발급받으세요
                    </p>
                </div>
            )}

            {/* API 사용량 게이지 (API 선택 시) */}
            {settings.dataSource === 'youtube_api' && apiUsage && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-gray-400">오늘 API 사용량</h3>
                        <span className="text-sm" style={{ color: usageColor }}>
                            {apiUsage.unitsUsed.toLocaleString()} / {apiUsage.dailyLimit.toLocaleString()} 유닛
                        </span>
                    </div>

                    <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full transition-all duration-300 rounded-full"
                            style={{
                                width: `${usagePercent}%`,
                                backgroundColor: usageColor
                            }}
                        />
                    </div>

                    <p className="text-xs text-gray-500">
                        {usagePercent < 80
                            ? `새로고침 약 ${Math.floor((apiUsage.dailyLimit - apiUsage.unitsUsed) / 500)}회 가능`
                            : '사용량이 많습니다. 내일 리셋됩니다.'
                        }
                    </p>
                </div>
            )}

            {/* 최대 영상 개수 */}
            <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-400">채널당 최대 영상 개수</h3>
                <select
                    value={settings.maxVideosPerChannel}
                    onChange={async (e) => {
                        const updated = { ...settings, maxVideosPerChannel: parseInt(e.target.value) };
                        setSettings(updated);
                        await StorageManager.updateSettings(updated);
                    }}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-red-500"
                >
                    <option value={100}>100개</option>
                    <option value={300}>300개</option>
                    <option value={500}>500개</option>
                    <option value={800}>800개</option>
                </select>
            </div>

            {/* GitHub 자동 동기화 */}
            <div className="space-y-3 border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-400">GitHub 자동 동기화</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.autoSyncChannels || false}
                            onChange={(e) => handleToggleAutoSync(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                    </label>
                </div>
                <p className="text-xs text-gray-500">
                    채널 추가/삭제 시 자동으로 GitHub에 실시간 반영
                </p>

                {settings.autoSyncChannels && (
                    <>
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400">GitHub Repository</label>
                            <input
                                type="text"
                                value={githubRepoInput}
                                onChange={(e) => setGithubRepoInput(e.target.value)}
                                placeholder="username/pocketmontube"
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-red-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-gray-400">Personal Access Token</label>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={githubTokenInput}
                                    onChange={(e) => setGithubTokenInput(e.target.value)}
                                    placeholder="ghp_..."
                                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-red-500"
                                />
                                <button
                                    onClick={handleValidateGitHub}
                                    disabled={validatingGithub || !githubTokenInput || !githubRepoInput}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    {validatingGithub ? '확인 중...' : '검증'}
                                </button>
                            </div>
                            {githubValid === true && (
                                <p className="text-xs text-green-500">✓ GitHub 연결 성공!</p>
                            )}
                            {githubValid === false && (
                                <p className="text-xs text-red-500">✗ 연결 실패. Token과 Repo를 확인하세요.</p>
                            )}
                            <p className="text-xs text-gray-500">
                                * GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)에서 <code className="bg-gray-800 px-1 py-0.5 rounded">repo</code> 권한으로 발급
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
