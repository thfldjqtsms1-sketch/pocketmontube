import { useState, useEffect } from 'react';
import { StorageManager } from '../utils/storage';
import type { Group, Channel } from '../types';
import GroupList from './components/GroupList';
import GroupForm from './components/GroupForm';
import Header from './components/Header';
import VideoList from './components/VideoList';
import SettingsPanel from './components/SettingsPanel';

type View = 'list' | 'create' | 'edit' | 'videos' | 'settings';

export default function App() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentView, setCurrentView] = useState<View>('list');
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isCollectingAll, setIsCollectingAll] = useState(false);
  const [collectProgress, setCollectProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    loadGroups();
    checkCurrentPage();

    // 스토리지 변경 감지
    StorageManager.onChanged((changes) => {
      if (changes.groups) {
        setGroups(changes.groups);
      }
    });

    // 수집 진행 상태 메시지 리스너
    const messageListener = (message: any) => {
      if (message.type === 'COLLECT_PROGRESS') {
        setCollectProgress({ current: message.current, total: message.total });
      } else if (message.type === 'COLLECT_COMPLETE') {
        setIsCollectingAll(false);
        setCollectProgress(null);
        loadGroups(); // 완료 후 그룹 새로고침
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const loadGroups = async () => {
    const loaded = await StorageManager.getGroups();
    setGroups(loaded);
  };

  const checkCurrentPage = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url?.includes('youtube.com')) {
      // Content script에 메시지 보내서 현재 채널 정보 가져오기
      try {
        const response = await chrome.tabs.sendMessage(tab.id!, { type: 'GET_CHANNEL_INFO' });
        if (response?.channel) {
          setCurrentChannel(response.channel);
        }
      } catch (error) {
        console.log('Not on a channel page');
      }
    }
  };

  const handleCollectAll = async () => {
    if (isCollectingAll) return;

    setIsCollectingAll(true);
    setCollectProgress({ current: 0, total: groups.length });

    try {
      await chrome.runtime.sendMessage({ type: 'REFRESH_ALL_GROUPS_WITH_PROGRESS' });
    } catch (error) {
      console.error('Failed to collect all groups:', error);
      setIsCollectingAll(false);
      setCollectProgress(null);
    }
  };

  const handleCreateGroup = async (name: string, channels: Channel[]) => {
    await StorageManager.addGroup({ name, channels, videos: [] });
    setCurrentView('list');
  };

  const handleEditGroup = async (groupId: string, name: string, channels: Channel[]) => {
    await StorageManager.updateGroup(groupId, { name, channels });
    setCurrentView('list');
    setEditingGroup(null);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (confirm('이 그룹을 삭제하시겠습니까?')) {
      await StorageManager.deleteGroup(groupId);
    }
  };

  const startEdit = (group: Group) => {
    setEditingGroup(group);
    setCurrentView('edit');
  };

  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {currentView !== 'videos' && currentView !== 'settings' && (
        <Header
          currentView={currentView}
          onBack={() => {
            setCurrentView('list');
            setEditingGroup(null);
            setSelectedGroup(null);
          }}
          onNew={() => setCurrentView('create')}
          onSettings={() => setCurrentView('settings')}
          onCollectAll={handleCollectAll}
          isCollectingAll={isCollectingAll}
          collectProgress={collectProgress || undefined}
        />
      )}

      <div className={currentView === 'videos' || currentView === 'settings' ? 'h-full' : 'h-[calc(100%-64px)] overflow-y-auto'}>
        {currentView === 'list' && (
          <GroupList
            groups={groups}
            currentChannel={currentChannel}
            onEdit={startEdit}
            onDelete={handleDeleteGroup}
          />
        )}

        {currentView === 'videos' && selectedGroup && (
          <VideoList
            group={selectedGroup}
            onBack={() => {
              setCurrentView('list');
              setSelectedGroup(null);
            }}
          />
        )}

        {currentView === 'settings' && (
          <SettingsPanel
            onClose={() => setCurrentView('list')}
          />
        )}

        {currentView === 'create' && (
          <GroupForm
            initialChannel={currentChannel}
            onSubmit={handleCreateGroup}
            onCancel={() => setCurrentView('list')}
          />
        )}

        {currentView === 'edit' && editingGroup && (
          <GroupForm
            group={editingGroup}
            onSubmit={(name, channels) => handleEditGroup(editingGroup.id, name, channels)}
            onCancel={() => {
              setCurrentView('list');
              setEditingGroup(null);
            }}
          />
        )}
      </div>
    </div>
  );
}


