/**
 * GitHub API를 통한 자동 동기화 유틸리티
 */

import type { Group } from '../types';

export class GitHubSync {
  /**
   * GitHub에 channels.json 업데이트
   */
  static async updateChannels(
    groups: Group[],
    githubToken: string,
    githubRepo: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!githubToken || !githubRepo) {
        return { success: false, error: 'GitHub Token 또는 Repo가 설정되지 않았습니다.' };
      }

      const [owner, repo] = githubRepo.split('/');
      if (!owner || !repo) {
        return { success: false, error: '잘못된 리포지토리 형식입니다. (예: username/repo)' };
      }

      // channels.json 데이터 생성
      const channelsData = {
        groups: groups.map(g => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
          channels: g.channels || []
        })),
        lastExported: new Date().toISOString()
      };

      const content = JSON.stringify(channelsData, null, 2);
      const encodedContent = btoa(unescape(encodeURIComponent(content)));

      // 기존 파일의 SHA 가져오기 (업데이트를 위해 필요)
      const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/channels.json`;
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
        // 파일이 없으면 새로 생성
        console.log('[GitHubSync] File does not exist, creating new file');
      }

      // 파일 업데이트 또는 생성
      const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/channels.json`;
      const putResponse = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `chore: auto-update channels list [${new Date().toLocaleString('ko-KR')}]`,
          content: encodedContent,
          sha: sha,
          branch: 'main'
        })
      });

      if (!putResponse.ok) {
        const error = await putResponse.text();
        console.error('[GitHubSync] Update failed:', error);
        return { success: false, error: `GitHub API 오류: ${putResponse.status}` };
      }

      console.log('[GitHubSync] Channels updated successfully');
      return { success: true };
    } catch (error) {
      console.error('[GitHubSync] Error:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * GitHub Token 유효성 검사
   */
  static async validateToken(githubToken: string, githubRepo: string): Promise<boolean> {
    try {
      const [owner, repo] = githubRepo.split('/');
      if (!owner || !repo) return false;

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.ok;
    } catch (e) {
      return false;
    }
  }
}
