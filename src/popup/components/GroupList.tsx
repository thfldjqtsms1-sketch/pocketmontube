import { useState, useEffect } from 'react';
import type { Group, Channel } from '../../types';
import { StorageManager } from '../../utils/storage';
import { YouTubeUrl } from '../../utils/youtube';

interface GroupListProps {
  groups: Group[];
  currentChannel: Channel | null;
  onEdit: (group: Group) => void;
  onDelete: (groupId: string) => void;
}

export default function GroupList({ groups, currentChannel, onEdit, onDelete }: GroupListProps) {
  const [maxVideos, setMaxVideos] = useState<number>(300);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await StorageManager.getSettings();
    setMaxVideos(settings.maxVideosPerChannel);
  };

  const handleMaxVideosChange = async (value: number) => {
    setMaxVideos(value);
    await StorageManager.updateSettings({ maxVideosPerChannel: value });
  };

  const handleAddToGroup = async (group: Group) => {
    if (!currentChannel) return;
    await StorageManager.addChannelToGroup(group.id, currentChannel);
  };

  const handleRemoveFromGroup = async (groupId: string, channelId: string) => {
    await StorageManager.removeChannelFromGroup(groupId, channelId);
  };

  const openChannel = (channelId: string) => {
    chrome.tabs.create({ url: YouTubeUrl.channelUrl(channelId) });
  };

  // 그룹 영상 페이지 새 탭에서 열기
  const openGroupVideosPage = (group: Group) => {
    const url = chrome.runtime.getURL(`src/group-videos/index.html?groupId=${group.id}`);
    chrome.tabs.create({ url });
  };

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <svg className="w-24 h-24 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3 className="text-xl font-semibold text-gray-300 mb-2">아직 그룹이 없습니다</h3>
        <p className="text-gray-500 mb-6">새 그룹을 만들어 YouTube 구독을 정리해보세요!</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* 설정 카드 */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-300">⚙️ 설정</h3>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-gray-400 block">채널당 최대 영상 수</label>
          <select
            value={maxVideos}
            onChange={(e) => handleMaxVideosChange(Number(e.target.value))}
            className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-red-500"
          >
            <option value={100}>100개</option>
            <option value={300}>300개 (권장)</option>
            <option value={500}>500개</option>
            <option value={800}>800개</option>
          </select>
          <p className="text-xs text-gray-500">영상 수가 많을수록 수집 시간이 오래 걸립니다</p>
        </div>
      </div>

      {currentChannel && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-3">
            {currentChannel.thumbnail && (
              <img src={currentChannel.thumbnail} alt="" className="w-10 h-10 rounded-full" />
            )}
            <div className="flex-1">
              <p className="text-sm text-blue-300">현재 페이지</p>
              <p className="font-semibold">{currentChannel.name}</p>
            </div>
          </div>
        </div>
      )}

      {groups.map(group => (
        <div key={group.id} className="bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              {/* 그룹 이름 클릭 시 영상 보기 */}
              <button
                onClick={() => openGroupVideosPage(group)}
                className="flex-1 flex items-center gap-2 text-left hover:text-red-400 transition-colors"
              >
                <span className="text-2xl">{group.icon || '📁'}</span>
                <div>
                  <h3 className="text-lg font-bold">{group.name}</h3>
                  <p className="text-xs text-gray-400">
                    {group.channels.length}개 채널 • {group.videos?.length || 0}개 영상
                  </p>
                </div>
              </button>
              <div className="flex gap-1">
                {currentChannel && !group.channels.some(c => c.id === currentChannel.id) && (
                  <button
                    onClick={() => handleAddToGroup(group)}
                    className="p-2 hover:bg-green-600 rounded-lg transition-colors"
                    title="현재 채널 추가"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
                {/* 영상 보기 버튼 */}
                <button
                  onClick={() => openGroupVideosPage(group)}
                  className="p-2 hover:bg-blue-600 rounded-lg transition-colors"
                  title="영상 보기"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => onEdit(group)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                  title="수정"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(group.id)}
                  className="p-2 hover:bg-red-600 rounded-lg transition-colors"
                  title="삭제"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {group.channels.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {group.channels.map(channel => (
                  <div
                    key={channel.id}
                    className="flex items-center gap-2 p-2 bg-gray-900 rounded hover:bg-gray-700 transition-colors group"
                  >
                    {channel.thumbnail && (
                      <img src={channel.thumbnail} alt="" className="w-8 h-8 rounded-full" />
                    )}
                    <button
                      onClick={() => openChannel(channel.id)}
                      className="flex-1 text-left text-sm hover:text-red-400 transition-colors"
                    >
                      {channel.name}
                    </button>
                    <button
                      onClick={() => handleRemoveFromGroup(group.id, channel.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-600 rounded transition-all"
                      title="제거"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
