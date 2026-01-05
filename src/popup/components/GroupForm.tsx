import { useState } from 'react';
import type { Group, Channel } from '../../types';

interface GroupFormProps {
  group?: Group;
  initialChannel?: Channel | null;
  onSubmit: (name: string, channels: Channel[]) => void;
  onCancel: () => void;
}

const EMOJI_OPTIONS = ['📁', '🎵', '🎮', '🎨', '📚', '🎬', '🏃', '🍔', '🌟', '💼', '🔧', '🎓'];

export default function GroupForm({ group, initialChannel, onSubmit, onCancel }: GroupFormProps) {
  const [name, setName] = useState(group?.name || '');
  const [selectedIcon, setSelectedIcon] = useState(group?.icon || '📁');
  const [channels, setChannels] = useState<Channel[]>(
    group?.channels || (initialChannel ? [initialChannel] : [])
  );
  const [channelInput, setChannelInput] = useState({ name: '', id: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name, channels);
  };

  const addChannel = () => {
    if (!channelInput.name.trim() || !channelInput.id.trim()) return;

    const newChannel: Channel = {
      id: channelInput.id,
      name: channelInput.name
    };

    setChannels([...channels, newChannel]);
    setChannelInput({ name: '', id: '' });
  };

  const removeChannel = (channelId: string) => {
    setChannels(channels.filter(c => c.id !== channelId));
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-6">
      {/* 그룹 이름 */}
      <div>
        <label className="block text-sm font-semibold mb-2">그룹 이름</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 음악, 게임, 개발..."
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
          autoFocus
          required
        />
      </div>

      {/* 아이콘 선택 */}
      <div>
        <label className="block text-sm font-semibold mb-2">아이콘</label>
        <div className="grid grid-cols-6 gap-2">
          {EMOJI_OPTIONS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => setSelectedIcon(emoji)}
              className={`p-3 text-2xl rounded-lg transition-all ${
                selectedIcon === emoji
                  ? 'bg-red-600 scale-110 shadow-lg'
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* 채널 목록 */}
      <div>
        <label className="block text-sm font-semibold mb-2">
          채널 ({channels.length})
        </label>

        {channels.length > 0 && (
          <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
            {channels.map(channel => (
              <div
                key={channel.id}
                className="flex items-center justify-between p-2 bg-gray-800 rounded-lg group"
              >
                <span className="text-sm">{channel.name}</span>
                <button
                  type="button"
                  onClick={() => removeChannel(channel.id)}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-600 rounded transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 채널 추가 폼 */}
        <div className="space-y-2">
          <input
            type="text"
            value={channelInput.name}
            onChange={(e) => setChannelInput({ ...channelInput, name: e.target.value })}
            placeholder="채널 이름"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-red-500 focus:outline-none text-sm"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={channelInput.id}
              onChange={(e) => setChannelInput({ ...channelInput, id: e.target.value })}
              placeholder="채널 ID (UCxxxxx 또는 @handle)"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-red-500 focus:outline-none text-sm"
            />
            <button
              type="button"
              onClick={addChannel}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-sm font-semibold"
            >
              추가
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-2">
          💡 Tip: YouTube 채널 페이지에서 이 확장 프로그램을 열면 자동으로 채널이 추가됩니다!
        </p>
      </div>

      {/* 버튼 */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors font-semibold"
        >
          취소
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-semibold shadow-lg"
        >
          {group ? '수정' : '만들기'}
        </button>
      </div>
    </form>
  );
}
