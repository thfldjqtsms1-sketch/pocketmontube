import { StorageManager } from '../utils/storage';
import { DEFAULT_SETTINGS } from '../types';
import { VideoCollector } from './video-collector';
import { YouTubeAPI, ApiUsageTracker } from '../utils/youtube-api';

/**
 * Background Service Worker (Manifest V3)
 * 2025 최신 Chrome Extension API 사용
 */

/**
 * Extension 설치/업데이트 시 초기화
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[MyTube] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // 첫 설치 시 기본 설정 초기화
    await StorageManager.updateSettings(DEFAULT_SETTINGS);

    // 환영 메시지 (선택사항)
    chrome.tabs.create({
      url: 'https://www.youtube.com'
    });

    console.log('[MyTube] Welcome! Extension initialized.');
  } else if (details.reason === 'update') {
    console.log('[MyTube] Extension updated to version', chrome.runtime.getManifest().version);
  }

  // 자동 수집 비활성화 - 사용자가 수동으로 새로고침 버튼을 누를 때만 수집
  // 초기 자동 수집이 필요하면 아래 주석 해제
  // setTimeout(async () => {
  //   await VideoCollector.collectAllVideos();
  // }, 5000);
});

/**
 * Extension 아이콘 클릭 시 (Popup이 열릴 때)
 */
chrome.action.onClicked.addListener((tab) => {
  console.log('[MyTube] Extension icon clicked on tab:', tab.id);
});

/**
 * Context Menu 설정 (선택사항 - 나중에 추가 가능)
 */
// chrome.runtime.onInstalled.addListener(() => {
//   chrome.contextMenus.create({
//     id: 'add-to-group',
//     title: '이 채널을 그룹에 추가',
//     contexts: ['page'],
//     documentUrlPatterns: ['https://*.youtube.com/*']
//   });
// });

/**
 * 메시지 수신 처리
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[MyTube] Message received:', message);

  // 비동기 핸들러를 Promise로 래핑
  const handleAsync = async () => {
    try {
      if (message.type === 'GET_GROUPS') {
        const groups = await StorageManager.getGroups();
        sendResponse({ groups });
      } else if (message.type === 'SYNC_DATA') {
        // 데이터 동기화 로직
        sendResponse({ success: true });
      } else if (message.type === 'COLLECT_VIDEOS') {
        // 수동 영상 수집 트리거
        await VideoCollector.collectAllVideos();
        sendResponse({ success: true });
      } else if (message.type === 'DOWNLOAD_VIDEO') {
        // 다운로드 서버에 요청 (HTTPS 혼합 콘텐츠 우회)
        const { videoId, mode } = message;
        try {
          const settings = await chrome.storage.local.get(['downloadServerUrl', 'downloadServerToken']);
          const serverUrl = settings.downloadServerUrl || 'http://localhost:9527';
          const serverToken = settings.downloadServerToken || '';

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (serverToken) {
            headers['Authorization'] = `Bearer ${serverToken}`;
          }

          const response = await fetch(`${serverUrl}/download`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ videoId, mode })
          });

          if (response.ok) {
            const result = await response.json();
            // 파일 목록 페이지 URL 생성
            const filesUrl = `${serverUrl}/files?token=${serverToken}`;
            sendResponse({
              success: true,
              message: result.message || 'Started',
              filesUrl: filesUrl
            });
          } else if (response.status === 401) {
            sendResponse({ success: false, error: '인증 실패: 토큰을 확인하세요.' });
          } else {
            sendResponse({ success: false, error: `서버 오류: ${response.status}` });
          }
        } catch (error) {
          console.error('[MyTube] Download request failed:', error);
          sendResponse({ success: false, error: '서버 연결 실패' });
        }
      } else if (message.type === 'COLLECT_GROUP_VIDEOS') {
        // 특정 그룹만 수집
        const { groupId } = message;
        const group = await StorageManager.getGroup(groupId);
        if (group) {
          await VideoCollector.collectGroupVideos(group);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Group not found' });
        }
      } else if (message.type === 'UPDATE_GROUP_TIMESTAMP') {
        // 그룹 타임스탬프만 업데이트
        const { groupId } = message;
        await StorageManager.updateGroupTimestamp(groupId);
        sendResponse({ success: true });
      } else if (message.type === 'FORCE_UPDATE_VIDEO') {
        // 개별 영상 강제 업데이트 (직접 fetch)
        const { videoId, groupId } = message;
        console.log(`[MyTube] Force updating video ${videoId}`);

        try {
          const result = await fetchViewCountDirectly(videoId);
          if (result) {
            // 스토리지에서 영상 업데이트
            const groups = await StorageManager.getGroups();
            const group = groups.find(g => g.id === groupId);
            if (group) {
              const videoIndex = group.videos.findIndex(v => v.id === videoId);
              if (videoIndex >= 0) {
                group.videos[videoIndex].viewCount = result.viewCount;
                if (result.uploadedAt) {
                  group.videos[videoIndex].uploadedAt = result.uploadedAt;
                  group.videos[videoIndex].hasExactDate = true;
                }
                // 바이럴 스코어 재계산
                const hoursAge = Math.max(1, (Date.now() - group.videos[videoIndex].uploadedAt) / (1000 * 60 * 60));
                group.videos[videoIndex].viralScore = Math.round(result.viewCount / hoursAge);

                await StorageManager.updateGroup(groupId, { videos: group.videos });
                console.log(`[MyTube] Force update success: viewCount=${result.viewCount}, uploadedAt=${result.uploadedAt}`);
                sendResponse({ success: true, viewCount: result.viewCount, uploadedAt: result.uploadedAt });
              } else {
                sendResponse({ success: false, error: 'Video not found in group' });
              }
            } else {
              sendResponse({ success: false, error: 'Group not found' });
            }
          } else {
            sendResponse({ success: false, error: 'Failed to fetch video data' });
          }
        } catch (error) {
          console.error('[MyTube] Force update error:', error);
          sendResponse({ success: false, error: String(error) });
        }
      } else if (message.type === 'COLLECT_CHANNELS_VIA_TABS') {
        // 채널 탭을 열어 실시간 수집
        const { channelUrls, groupId } = message;
        console.log('[MyTube] Opening tabs for channels:', channelUrls);

        const openedTabIds: number[] = [];

        for (const url of channelUrls) {
          try {
            const tab = await chrome.tabs.create({ url, active: false });
            if (tab.id) openedTabIds.push(tab.id);

            // 탭이 로드되고 AutoCollector가 처리할 시간 대기
            await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (e) {
            console.error('[MyTube] Failed to open tab:', e);
          }
        }

        // 모든 탭 닫기
        for (const tabId of openedTabIds) {
          try {
            await chrome.tabs.remove(tabId);
          } catch (e) {
            // 이미 닫힌 탭 무시
          }
        }

        // 타임스탬프 업데이트
        await StorageManager.updateGroupTimestamp(groupId);

        sendResponse({ success: true, tabsOpened: openedTabIds.length });
      } else if (message.type === 'REFRESH_GROUP_VIDEOS') {
        // 새 영상 수집 + 조회수 업데이트
        const { groupId } = message;
        console.log('[MyTube] Refreshing group:', groupId);

        const group = await StorageManager.getGroup(groupId);
        if (!group) {
          sendResponse({ success: false, error: 'Group not found' });
        } else if (!group.channels || group.channels.length === 0) {
          // 채널이 없는 그룹 (바이럴 폴더 등) → 다른 그룹에서 데이터 동기화
          console.log('[MyTube] No channels in group, syncing from other groups...');
          const syncedCount = await StorageManager.syncVideosFromOtherGroups(groupId);
          await StorageManager.updateGroupTimestamp(groupId);
          console.log(`[MyTube] Synced ${syncedCount} videos from other groups`);
          sendResponse({ success: true, newVideos: 0, viewCountsUpdated: syncedCount, syncedFromOtherGroups: true });
        } else {

          const settings = await StorageManager.getSettings();
          const dataSource = settings.dataSource || 'html';
          console.log(`[MyTube] Data source: ${dataSource}`);

          let newVideosCount = 0;
          let viewCountsUpdated = 0;

          // YouTube API 사용 (가장 빠름)
          if (dataSource === 'youtube_api' && settings.youtubeApiKey) {
            console.log('[MyTube] Using YouTube Data API');
            const api = new YouTubeAPI(settings.youtubeApiKey);

            const existingIds = new Set((group.videos || []).map(v => v.id));
            let totalUnitsUsed = 0;
            const allNewVideos: any[] = [];

            for (const channel of group.channels || []) {
              try {
                const { videos, unitsUsed } = await api.searchVideos(channel, groupId, 50);
                totalUnitsUsed += unitsUsed;

                // 새 영상만 필터링
                const newVideos = videos.filter(v => !existingIds.has(v.id));
                allNewVideos.push(...newVideos);

                console.log(`[MyTube] API: ${newVideos.length} new from ${channel.name} (${unitsUsed} units)`);

                // 짧은 딜레이
                await new Promise(resolve => setTimeout(resolve, 300));
              } catch (err) {
                console.error(`[MyTube] API failed for ${channel.name}:`, err);
              }
            }

            // API 사용량 기록
            if (totalUnitsUsed > 0) {
              await ApiUsageTracker.addUsage(totalUnitsUsed);
            }

            // 새 영상 저장
            if (allNewVideos.length > 0) {
              await StorageManager.addVideosToGroup(groupId, allNewVideos);
              newVideosCount = allNewVideos.length;
              console.log(`[MyTube] Added ${allNewVideos.length} new videos via YouTube API`);
            }

            // 기존 영상들의 duration, isShorts, viewCount 업데이트 (점진적: 50개씩)
            const updatedGroup = await StorageManager.getGroup(groupId);
            const allExistingVideos = updatedGroup?.videos || [];

            // 우선순위: duration이 없거나 '0:00'인 영상 먼저
            const videosNeedUpdate = allExistingVideos.filter(
              v => !v.duration || v.duration === '0:00' || v.duration === 'Shorts'
            );
            const videosAlreadyUpdated = allExistingVideos.filter(
              v => v.duration && v.duration !== '0:00' && v.duration !== 'Shorts'
            );

            // 필요한 영상 먼저, 그 다음 이미 업데이트된 영상 (최대 50개)
            const MAX_UPDATE_PER_REFRESH = 50;
            const videosToUpdate = [...videosNeedUpdate, ...videosAlreadyUpdated].slice(0, MAX_UPDATE_PER_REFRESH);

            if (videosToUpdate.length > 0) {
              console.log(`[MyTube] Updating details for ${videosToUpdate.length}/${allExistingVideos.length} videos (${videosNeedUpdate.length} need update)...`);
              const videoIdsToUpdate = videosToUpdate.map(v => v.id);
              const { updates: detailUpdates, unitsUsed: detailUnits } = await api.getVideoDetails(videoIdsToUpdate);

              if (detailUnits > 0) {
                totalUnitsUsed += detailUnits;
                await ApiUsageTracker.addUsage(detailUnits);
              }

              if (detailUpdates.length > 0) {
                await StorageManager.updateVideoDetails(groupId, detailUpdates);
                viewCountsUpdated = detailUpdates.length;
                console.log(`[MyTube] Updated details for ${detailUpdates.length} videos`);
              }
            } else {
              viewCountsUpdated = allNewVideos.length;
            }



          } else {
            // 기존 방식: RSS + API/직접fetch
            console.log('[MyTube] Using RSS + viewCount API');

            // 1. RSS 피드로 새 영상 수집
            const newVideos: any[] = [];
            const existingIds = new Set((group.videos || []).map(v => v.id));
            console.log(`[MyTube] Existing videos: ${existingIds.size}`);

            for (const channel of group.channels || []) {
              try {
                const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
                console.log(`[MyTube] Fetching RSS for ${channel.name}`);
                const response = await fetch(rssUrl);

                if (response.ok) {
                  const xml = await response.text();
                  const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
                  let entryCount = 0;

                  for (const match of entryMatches) {
                    entryCount++;
                    const entryXml = match[1];

                    const videoIdMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
                    const videoId = videoIdMatch?.[1];

                    if (!videoId) continue;
                    if (existingIds.has(videoId)) continue;

                    const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
                    const title = titleMatch?.[1] || 'Unknown';

                    const publishedMatch = entryXml.match(/<published>([^<]+)<\/published>/);
                    const published = publishedMatch?.[1];
                    const uploadedAt = published ? new Date(published).getTime() : Date.now();
                    const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                    newVideos.push({
                      id: videoId,
                      title,
                      channelId: channel.id,
                      channelName: channel.name,
                      thumbnail,
                      duration: '0:00',
                      viewCount: 0,
                      uploadedAt,
                      url: `https://www.youtube.com/watch?v=${videoId}`,
                      watched: false,
                      groupId,
                      isShorts: false,
                      hasExactDate: !!published
                    });
                  }
                  console.log(`[MyTube] RSS entries for ${channel.name}: ${entryCount}`);
                } else {
                  console.warn(`[MyTube] RSS fetch failed for ${channel.name}: ${response.status}`);
                }
              } catch (e) {
                console.warn(`[MyTube] RSS failed for ${channel.name}:`, e);
              }
            }

            // 새 영상들의 Shorts 여부 확인
            if (newVideos.length > 0) {
              console.log(`[MyTube] Checking Shorts status for ${newVideos.length} new videos...`);
              const SHORTS_CHECK_BATCH = 5;
              for (let i = 0; i < newVideos.length; i += SHORTS_CHECK_BATCH) {
                const batch = newVideos.slice(i, i + SHORTS_CHECK_BATCH);
                await Promise.all(
                  batch.map(async (video) => {
                    const isShorts = await checkIfShorts(video.id);
                    if (isShorts) {
                      video.isShorts = true;
                      video.url = `https://www.youtube.com/shorts/${video.id}`;
                      console.log(`[MyTube] ${video.id} is a Short`);
                    }
                  })
                );
                if (i + SHORTS_CHECK_BATCH < newVideos.length) {
                  await new Promise(resolve => setTimeout(resolve, 300));
                }
              }
            }

            // 새 영상 저장
            if (newVideos.length > 0) {
              await StorageManager.addVideosToGroup(groupId, newVideos);
              newVideosCount = newVideos.length;
              console.log(`[MyTube] Added ${newVideos.length} new videos from RSS`);
            }

            // 2. API로 조회수 업데이트
            const viewCountSource = settings.viewCountSource || 'returnyoutubedislike';
            console.log(`[MyTube] View count source: ${viewCountSource}`);

            const updatedGroup = await StorageManager.getGroup(groupId);
            const allVideos = updatedGroup?.videos || [];
            const videoIds = allVideos.map(v => v.id);
            console.log(`[MyTube] Updating view counts for ${videoIds.length} videos`);

            const updates: { videoId: string; viewCount: number; uploadedAt?: number | null; duration?: string | null }[] = [];
            const BATCH_SIZE = viewCountSource === 'directfetch' ? 5 : 10;

            for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
              const batch = videoIds.slice(i, i + BATCH_SIZE);

              const batchResults = await Promise.all(
                batch.map(async (videoId: string) => {
                  try {
                    if (viewCountSource === 'directfetch') {
                      const result = await fetchViewCountDirectly(videoId);
                      if (result && result.viewCount > 0) {
                        return { videoId, viewCount: result.viewCount, uploadedAt: result.uploadedAt, duration: result.duration };
                      }
                    } else {
                      const apiUrl = `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`;
                      const res = await fetch(apiUrl);
                      if (res.ok) {
                        const data = await res.json();
                        if (data.viewCount && data.viewCount > 0) {
                          return { videoId, viewCount: data.viewCount };
                        }
                      }
                    }
                  } catch (err) {
                    console.log(`[MyTube] Fetch failed for ${videoId}:`, err);
                  }
                  return null;
                })
              );

              for (const result of batchResults) {
                if (result) updates.push(result);
              }

              if (viewCountSource === 'directfetch' && i + BATCH_SIZE < videoIds.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }

            if (updates.length > 0) {
              // directfetch는 forceOverwrite: true로 무조건 새 값으로 덮어씀
              const forceOverwrite = viewCountSource === 'directfetch';
              await StorageManager.updateVideoViewCounts(groupId, updates, forceOverwrite);
              viewCountsUpdated = updates.length;
            }
          }

          // 타임스탬프 업데이트
          await StorageManager.updateGroupTimestamp(groupId);

          console.log(`[MyTube] Refresh complete: ${newVideosCount} new, ${viewCountsUpdated} view counts updated`);
          sendResponse({ success: true, newVideos: newVideosCount, viewCountsUpdated });
        }
      } else if (message.type === 'REFRESH_ALL_GROUPS') {
        // 모든 그룹 순차 수집
        console.log('[MyTube] Refreshing all groups...');
        const groups = await StorageManager.getGroups();
        const results: { groupId: string; groupName: string; success: boolean; newVideos?: number; viewCountsUpdated?: number }[] = [];

        for (const group of groups) {
          try {
            // 채널이 없는 그룹은 다른 그룹에서 동기화
            if (!group.channels || group.channels.length === 0) {
              const syncedCount = await StorageManager.syncVideosFromOtherGroups(group.id);
              await StorageManager.updateGroupTimestamp(group.id);
              results.push({ groupId: group.id, groupName: group.name, success: true, newVideos: 0, viewCountsUpdated: syncedCount });
              console.log(`[MyTube] ${group.name}: Synced ${syncedCount} from other groups`);
            } else {
              // 채널이 있는 그룹은 직접 수집 (내부에서 sendMessage 대신 직접 호출)
              // 간단하게 VideoCollector 사용
              await VideoCollector.collectGroupVideos(group);
              results.push({ groupId: group.id, groupName: group.name, success: true });
              console.log(`[MyTube] ${group.name}: Collected videos`);
            }
            // 그룹 간 딜레이
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (err) {
            console.error(`[MyTube] Failed to refresh ${group.name}:`, err);
            results.push({ groupId: group.id, groupName: group.name, success: false });
          }
        }

        console.log('[MyTube] All groups refresh complete:', results);
        sendResponse({ success: true, results });
      } else if (message.type === 'REFRESH_ALL_GROUPS_WITH_PROGRESS') {
        // 모든 그룹 순차 수집 (진행률 표시 포함)
        console.log('[MyTube] Refreshing all groups with progress...');
        const groups = await StorageManager.getGroups();
        const total = groups.length;

        for (let i = 0; i < groups.length; i++) {
          const group = groups[i];

          // 진행률 브로드캐스트
          chrome.runtime.sendMessage({
            type: 'COLLECT_PROGRESS',
            current: i + 1,
            total: total,
            groupName: group.name
          }).catch(() => {
            // 리스너가 없을 수 있음, 무시
          });

          try {
            if (!group.channels || group.channels.length === 0) {
              await StorageManager.syncVideosFromOtherGroups(group.id);
              await StorageManager.updateGroupTimestamp(group.id);
              console.log(`[MyTube] ${group.name}: Synced from other groups`);
            } else {
              await VideoCollector.collectGroupVideos(group);
              console.log(`[MyTube] ${group.name}: Collected videos`);
            }
            // 그룹 간 딜레이
            await new Promise(resolve => setTimeout(resolve, 300));
          } catch (err) {
            console.error(`[MyTube] Failed to refresh ${group.name}:`, err);
          }
        }

        // 완료 메시지 브로드캐스트
        chrome.runtime.sendMessage({
          type: 'COLLECT_COMPLETE',
          total: total
        }).catch(() => {
          // 리스너가 없을 수 있음, 무시
        });

        console.log('[MyTube] All groups refresh complete with progress');
        sendResponse({ success: true });
      } else if (message.type === 'SYNC_FROM_GITHUB') {
        // GitHub에서 영상 데이터 동기화
        console.log('[MyTube] Syncing from GitHub...');
        const { repoUrl } = message;

        try {
          // GitHub raw 파일 URL
          const videosUrl = repoUrl
            ? `${repoUrl}/raw/main/data/videos.json`
            : 'https://raw.githubusercontent.com/thfldjqtsms1-sketch/pocketmontube/main/data/videos.json';

          console.log(`[MyTube] Fetching from: ${videosUrl}`);
          const response = await fetch(videosUrl);

          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
          }

          const data = await response.json();
          const githubVideos = data.videos || [];

          console.log(`[MyTube] Fetched ${githubVideos.length} videos from GitHub`);

          // 그룹별로 영상 분류 및 병합
          const groups = await StorageManager.getGroups();
          let totalMerged = 0;

          for (const group of groups) {
            const groupVideos = githubVideos.filter((v: any) => v.groupId === group.id);
            if (groupVideos.length > 0) {
              // 기존 영상과 병합 (새 영상만 추가)
              const existingIds = new Set((group.videos || []).map(v => v.id));
              const newVideos = groupVideos.filter((v: any) => !existingIds.has(v.id));

              if (newVideos.length > 0) {
                await StorageManager.addVideosToGroup(group.id, newVideos);
                totalMerged += newVideos.length;
                console.log(`[MyTube] Added ${newVideos.length} videos to ${group.name}`);
              }

              // 기존 영상 조회수 업데이트
              const updates = groupVideos
                .filter((v: any) => existingIds.has(v.id))
                .map((v: any) => ({
                  videoId: v.id,
                  viewCount: v.viewCount,
                  uploadedAt: v.uploadedAt,
                  duration: v.duration
                }));

              if (updates.length > 0) {
                await StorageManager.updateVideoViewCounts(group.id, updates, true);
              }
            }
          }

          console.log(`[MyTube] Sync complete: ${totalMerged} new videos merged`);
          sendResponse({ success: true, merged: totalMerged, lastUpdated: data.lastUpdated });
        } catch (error) {
          console.error('[MyTube] GitHub sync error:', error);
          sendResponse({ success: false, error: String(error) });
        }
      } else if (message.type === 'EXPORT_CHANNELS') {
        // 채널 목록을 JSON으로 내보내기 (GitHub 업로드용)
        console.log('[MyTube] Exporting channels...');

        const groups = await StorageManager.getGroups();
        const exportData = {
          groups: groups.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.icon,
            channels: g.channels || []
          })),
          lastExported: new Date().toISOString()
        };

        sendResponse({ success: true, data: exportData });
      } else if (message.type === 'PUSH_VIDEOS_TO_GITHUB') {
        // 로컬 영상 데이터를 GitHub videos.json에 푸시
        console.log('[MyTube] Pushing videos to GitHub...');

        try {
          const settings = await StorageManager.getSettings();
          const githubToken = settings.githubToken;
          const githubRepo = settings.githubRepo;

          if (!githubToken || !githubRepo) {
            sendResponse({ success: false, error: 'GitHub Token 또는 Repo가 설정되지 않았습니다.' });
            return;
          }

          const [owner, repo] = githubRepo.split('/');
          if (!owner || !repo) {
            sendResponse({ success: false, error: '잘못된 리포지토리 형식입니다.' });
            return;
          }

          // 모든 그룹에서 영상 수집
          const groups = await StorageManager.getGroups();
          const allVideos: any[] = [];

          for (const group of groups) {
            if (group.videos && group.videos.length > 0) {
              for (const video of group.videos) {
                allVideos.push({
                  id: video.id,
                  title: video.title,
                  channelId: video.channelId,
                  channelName: video.channelName,
                  thumbnail: video.thumbnail,
                  duration: video.duration,
                  viewCount: video.viewCount,
                  uploadedAt: video.uploadedAt,
                  url: video.url,
                  isShorts: video.isShorts,
                  groupId: group.id,
                  viralScore: video.viralScore
                });
              }
            }
          }

          console.log(`[MyTube] Total videos to push: ${allVideos.length}`);

          // videos.json 생성
          const videosData = {
            lastUpdated: new Date().toISOString(),
            videos: allVideos
          };

          const content = JSON.stringify(videosData, null, 2);
          const encodedContent = btoa(unescape(encodeURIComponent(content)));

          // 기존 파일의 SHA 가져오기
          const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/videos.json`;
          let sha: string | undefined;

          try {
            const getResponse = await fetch(getUrl, {
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
              }
            });
            if (getResponse.ok) {
              const existingFile = await getResponse.json();
              sha = existingFile.sha;
            }
          } catch (e) {
            console.log('[MyTube] videos.json does not exist, creating new file');
          }

          // 파일 업데이트 또는 생성
          const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/videos.json`;
          const putResponse = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `chore: push ${allVideos.length} videos from extension [${new Date().toLocaleString('ko-KR')}]`,
              content: encodedContent,
              sha: sha,
              branch: 'main'
            })
          });

          if (!putResponse.ok) {
            const error = await putResponse.text();
            console.error('[MyTube] GitHub push failed:', error);
            sendResponse({ success: false, error: `GitHub API 오류: ${putResponse.status}` });
          } else {
            console.log(`[MyTube] Successfully pushed ${allVideos.length} videos to GitHub`);
            sendResponse({ success: true, count: allVideos.length });
          }
        } catch (error) {
          console.error('[MyTube] Push to GitHub error:', error);
          sendResponse({ success: false, error: String(error) });
        }
      } else {
        sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[MyTube] Message handler error:', error);
      sendResponse({ success: false, error: String(error) });
    }
  };

  // 비동기 핸들러 실행
  handleAsync();

  // 비동기 응답을 위해 true 반환
  return true;
});

/**
 * 스토리지 변경 감지
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    console.log('[MyTube] Storage changed:', changes);

    // 모든 YouTube 탭에 변경 알림
    chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'STORAGE_UPDATED',
            changes
          }).catch(() => {
            // Content script가 로드되지 않은 경우 무시
          });
        }
      });
    });
  }
});

/**
 * 주기적인 영상 수집 비활성화
 * 사용자가 수동으로 새로고침 버튼을 누를 때만 수집
 * 자동 수집이 필요하면 아래 주석 해제
 */
// chrome.alarms.create('video-collection', {
//   periodInMinutes: 60
// });

// chrome.alarms.onAlarm.addListener(async (alarm) => {
//   if (alarm.name === 'video-collection') {
//     console.log('[MyTube] Auto video collection triggered');
//     await VideoCollector.collectAllVideos();
//   }
// });

/**
 * Service Worker 활성화 유지 (선택사항)
 * Manifest V3에서는 Service Worker가 비활성화될 수 있음
 */
self.addEventListener('activate', (_event) => {
  console.log('[MyTube] Service Worker activated');
});

/**
 * Return YouTube Dislike API로 조회수 가져오기 (빠르고 429 에러 없음)
 */
async function fetchViewCountDirectly(videoId: string): Promise<{ viewCount: number; uploadedAt: number | null; duration: string | null } | null> {
  try {
    // Return YouTube Dislike API 사용
    const url = `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.log(`[MyTube] RYD API failed for ${videoId}: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const viewCount = data.viewCount || 0;

    if (viewCount === 0) {
      console.log(`[MyTube] No view count data for ${videoId}`);
      return null;
    }

    console.log(`[MyTube] RYD API success for ${videoId}: ${viewCount} views`);

    // RYD API는 조회수만 제공하므로 uploadedAt과 duration은 null
    return { viewCount, uploadedAt: null, duration: null };
  } catch (err) {
    console.log(`[MyTube] RYD API error for ${videoId}:`, err);
    return null;
  }
}

/**
 * 초 단위를 MM:SS 또는 HH:MM:SS 형식으로 변환
 * (현재 사용되지 않음 - RYD API 전환 후 필요없어짐)
 */
// function formatDuration(totalSeconds: number): string {
//   const hours = Math.floor(totalSeconds / 3600);
//   const minutes = Math.floor((totalSeconds % 3600) / 60);
//   const seconds = totalSeconds % 60;
//
//   if (hours > 0) {
//     return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
//   }
//   return `${minutes}:${seconds.toString().padStart(2, '0')}`;
// }

console.log('[MyTube] Background service worker loaded');

/**
 * Shorts 여부 확인 (HEAD 요청으로 /shorts/ URL 체크)
 * 200 OK = Shorts, 303 리다이렉트 = 일반 영상
 */
async function checkIfShorts(videoId: string): Promise<boolean> {
  try {
    const url = `https://www.youtube.com/shorts/${videoId}`;
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual' // 리다이렉트 자동 따라가지 않음
    });

    // 200 OK면 Shorts
    if (response.status === 200) {
      return true;
    }
    // 303/302 리다이렉트면 일반 영상
    if (response.status === 303 || response.status === 302) {
      return false;
    }
    // 그 외 상태는 일반 영상으로 간주
    return false;
  } catch (err) {
    console.log(`[MyTube] Shorts check failed for ${videoId}:`, err);
    return false;
  }
}
