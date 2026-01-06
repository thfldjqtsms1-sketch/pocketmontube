#!/usr/bin/env python3
"""
PocketMonTube - YouTube Video Downloader
yt-dlp 라이브러리 기반 다운로드 스크립트

설치: pip install yt-dlp
FFmpeg 필요: 없으면 최대 720p까지만 다운로드되거나 소리가 안 날 수 있음

사용법:
  python download.py --list                     # 그룹 및 영상 목록 보기
  python download.py --video VIDEO_ID           # 특정 영상 다운로드
  python download.py --video VIDEO_ID --audio   # MP3만 추출
  python download.py --video VIDEO_ID --subs    # 자막만 추출
  python download.py --group "게임"              # 그룹 영상 전체 다운로드
  python download.py --recent 10                # 최근 10개 영상 다운로드
"""

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime

try:
    import yt_dlp
except ImportError:
    print("❌ yt-dlp가 설치되어 있지 않습니다.")
    print("   설치: pip install yt-dlp")
    sys.exit(1)

# 스크립트 위치 기준 data 폴더
SCRIPT_DIR = Path(__file__).parent.parent
DATA_DIR = SCRIPT_DIR / "data"
VIDEOS_FILE = DATA_DIR / "videos.json"
DOWNLOAD_DIR = SCRIPT_DIR / "downloads"


def load_videos():
    """videos.json에서 영상 목록 로드"""
    if not VIDEOS_FILE.exists():
        print(f"❌ 영상 데이터 파일이 없습니다: {VIDEOS_FILE}")
        print("   Chrome 확장 프로그램에서 'GitHub에 푸시' 버튼을 눌러주세요.")
        sys.exit(1)
    
    with open(VIDEOS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    return data.get("videos", [])


def list_groups(videos):
    """그룹별 영상 개수 출력"""
    groups = {}
    for video in videos:
        group_id = video.get("groupId", "unknown")
        if group_id not in groups:
            groups[group_id] = {"count": 0, "sample": None}
        groups[group_id]["count"] += 1
        if not groups[group_id]["sample"]:
            groups[group_id]["sample"] = video.get("channelName", "Unknown")
    
    print("\n📁 그룹 목록:")
    print("-" * 50)
    for group_id, info in sorted(groups.items()):
        print(f"  {group_id}: {info['count']}개 영상 (예: {info['sample']})")
    print(f"\n총 {len(videos)}개 영상")


def list_videos(videos, limit=20):
    """최근 영상 목록 출력"""
    sorted_videos = sorted(videos, key=lambda v: v.get("uploadedAt", 0), reverse=True)
    
    print(f"\n📺 최근 영상 ({min(limit, len(sorted_videos))}개):")
    print("-" * 80)
    for i, video in enumerate(sorted_videos[:limit]):
        title = video.get("title", "Unknown")[:50]
        channel = video.get("channelName", "Unknown")[:15]
        video_id = video.get("id", "")
        duration = video.get("duration", "0:00")
        
        uploaded_at = video.get("uploadedAt", 0)
        if uploaded_at:
            date_str = datetime.fromtimestamp(uploaded_at / 1000).strftime("%Y-%m-%d")
        else:
            date_str = "Unknown"
        
        print(f"  {i+1:2}. [{video_id}] {title}...")
        print(f"      📺 {channel} | ⏱ {duration} | 📅 {date_str}")


def download_video(video_id, output_dir=None):
    """영상 다운로드 (최고 화질 + 오디오 합치기)"""
    if output_dir is None:
        output_dir = DOWNLOAD_DIR
    
    save_path = Path(output_dir)
    save_path.mkdir(parents=True, exist_ok=True)
    
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    
    ydl_opts = {
        # 최고화질 비디오 + 최고화질 오디오 합치기
        'format': 'bestvideo+bestaudio/best',
        # 저장 파일명 템플릿
        'outtmpl': str(save_path / '%(title)s.%(ext)s'),
        # MP4로 변환
        'postprocessors': [{
            'key': 'FFmpegVideoConvertor',
            'preferedformat': 'mp4',
        }],
        # 진행 상황 출력
        'progress_hooks': [_progress_hook],
    }
    
    print(f"\n⬇️  다운로드 시작: {video_id}")
    print(f"   URL: {video_url}")
    print(f"   저장 위치: {save_path}")
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            ydl.download([video_url])
            print("✅ 다운로드 완료!")
            return True
        except Exception as e:
            print(f"❌ 다운로드 실패: {e}")
            return False


def download_audio(video_id, output_dir=None):
    """오디오만 추출 (MP3 변환)"""
    if output_dir is None:
        output_dir = DOWNLOAD_DIR / "audio"
    
    save_path = Path(output_dir)
    save_path.mkdir(parents=True, exist_ok=True)
    
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': str(save_path / '%(title)s.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'progress_hooks': [_progress_hook],
    }
    
    print(f"\n🎵 오디오 추출 시작: {video_id}")
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            ydl.download([video_url])
            print("✅ 오디오 추출 완료!")
            return True
        except Exception as e:
            print(f"❌ 오디오 추출 실패: {e}")
            return False


def download_subtitles(video_id, output_dir=None, langs=None):
    """자막만 추출 (.srt 파일)"""
    if output_dir is None:
        output_dir = DOWNLOAD_DIR / "subs"
    if langs is None:
        langs = ['ko', 'en']
    
    save_path = Path(output_dir)
    save_path.mkdir(parents=True, exist_ok=True)
    
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    
    ydl_opts = {
        'skip_download': True,           # 영상은 다운로드 안 함
        'writesubtitles': True,          # 공식 자막 다운로드
        'writeautomaticsub': True,       # 자동 생성 자막도 다운로드
        'subtitleslangs': langs,         # 원하는 언어
        'postprocessors': [{
            'key': 'FFmpegSubtitlesConvertor',
            'format': 'srt',             # SRT 형식으로 변환
        }],
        'outtmpl': str(save_path / '%(title)s.%(ext)s'),
    }
    
    print(f"\n📝 자막 추출 시작: {video_id}")
    print(f"   언어: {', '.join(langs)}")
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(video_url, download=False)
            print(f"   제목: {info.get('title', 'Unknown')}")
            ydl.download([video_url])
            print("✅ 자막 추출 완료!")
            return True
        except Exception as e:
            print(f"❌ 자막 추출 실패: {e}")
            return False


def _progress_hook(d):
    """다운로드 진행 상황 출력"""
    if d['status'] == 'downloading':
        percent = d.get('_percent_str', 'N/A')
        speed = d.get('_speed_str', 'N/A')
        print(f"\r   진행: {percent} | 속도: {speed}", end='', flush=True)
    elif d['status'] == 'finished':
        print(f"\n   파일 저장됨: {d.get('filename', 'unknown')}")


def download_group(videos, group_id, limit=None, mode='video'):
    """그룹의 모든 영상 다운로드"""
    group_videos = [v for v in videos if v.get("groupId") == group_id]
    
    if not group_videos:
        print(f"❌ 그룹 '{group_id}'에 영상이 없습니다.")
        return
    
    group_videos.sort(key=lambda v: v.get("uploadedAt", 0), reverse=True)
    
    if limit:
        group_videos = group_videos[:limit]
    
    print(f"\n📁 그룹 '{group_id}' 다운로드 시작 ({len(group_videos)}개 영상)")
    print("=" * 50)
    
    success = 0
    failed = 0
    
    for i, video in enumerate(group_videos):
        video_id = video.get("id")
        title = video.get("title", "Unknown")[:40]
        
        print(f"\n[{i+1}/{len(group_videos)}] {title}...")
        
        group_dir = DOWNLOAD_DIR / group_id
        
        if mode == 'audio':
            result = download_audio(video_id, group_dir / "audio")
        elif mode == 'subs':
            result = download_subtitles(video_id, group_dir / "subs")
        else:
            result = download_video(video_id, group_dir)
        
        if result:
            success += 1
        else:
            failed += 1
    
    print(f"\n{'=' * 50}")
    print(f"✅ 완료: {success}개 성공, {failed}개 실패")


def download_recent(videos, count=10, mode='video'):
    """최근 N개 영상 다운로드"""
    sorted_videos = sorted(videos, key=lambda v: v.get("uploadedAt", 0), reverse=True)
    recent = sorted_videos[:count]
    
    print(f"\n📺 최근 {len(recent)}개 영상 다운로드 시작")
    print("=" * 50)
    
    success = 0
    failed = 0
    
    for i, video in enumerate(recent):
        video_id = video.get("id")
        title = video.get("title", "Unknown")[:40]
        
        print(f"\n[{i+1}/{len(recent)}] {title}...")
        
        if mode == 'audio':
            result = download_audio(video_id, DOWNLOAD_DIR / "recent" / "audio")
        elif mode == 'subs':
            result = download_subtitles(video_id, DOWNLOAD_DIR / "recent" / "subs")
        else:
            result = download_video(video_id, DOWNLOAD_DIR / "recent")
        
        if result:
            success += 1
        else:
            failed += 1
    
    print(f"\n{'=' * 50}")
    print(f"✅ 완료: {success}개 성공, {failed}개 실패")


def main():
    parser = argparse.ArgumentParser(
        description="PocketMonTube - YouTube Video Downloader (yt-dlp)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  python download.py --list                     그룹/영상 목록 보기
  python download.py --video dQw4w9WgXcQ        영상 다운로드 (최고 화질)
  python download.py --video dQw4w9WgXcQ --audio MP3 추출
  python download.py --video dQw4w9WgXcQ --subs 자막 추출
  python download.py --group "게임"             그룹 전체 다운로드
  python download.py --recent 5                 최근 5개 다운로드
  
요구사항:
  - pip install yt-dlp
  - FFmpeg 설치 (없으면 720p 제한, 오디오 합성 불가)
        """
    )
    
    parser.add_argument("--list", action="store_true", help="그룹 및 영상 목록 보기")
    parser.add_argument("--video", type=str, help="다운로드할 영상 ID")
    parser.add_argument("--group", type=str, help="다운로드할 그룹 ID")
    parser.add_argument("--recent", type=int, help="최근 N개 영상 다운로드")
    parser.add_argument("--limit", type=int, default=None, help="그룹 다운로드 시 최대 개수")
    parser.add_argument("--audio", action="store_true", help="오디오만 추출 (MP3)")
    parser.add_argument("--subs", action="store_true", help="자막만 추출 (SRT)")
    parser.add_argument("--output", type=str, help="다운로드 폴더 경로")
    
    args = parser.parse_args()
    
    if not any([args.list, args.group, args.video, args.recent]):
        parser.print_help()
        return
    
    global DOWNLOAD_DIR
    if args.output:
        DOWNLOAD_DIR = Path(args.output)
    
    # 모드 결정
    mode = 'video'
    if args.audio:
        mode = 'audio'
    elif args.subs:
        mode = 'subs'
    
    # 단일 영상 처리
    if args.video:
        if mode == 'audio':
            download_audio(args.video)
        elif mode == 'subs':
            download_subtitles(args.video)
        else:
            download_video(args.video)
        return
    
    # 영상 목록 필요한 명령들
    videos = load_videos()
    print(f"📊 {len(videos)}개 영상 로드됨")
    
    if args.list:
        list_groups(videos)
        list_videos(videos)
    elif args.group:
        download_group(videos, args.group, args.limit, mode)
    elif args.recent:
        download_recent(videos, args.recent, mode)


if __name__ == "__main__":
    main()
