#!/usr/bin/env python3
"""
GitHub Actions용 자막 추출 스크립트
videos.json의 영상들에서 자막(텍스트)을 추출하여 data/subtitles/에 저장

사용법:
  python extract_subtitles.py --recent 10   # 최근 10개 영상 자막 추출
  python extract_subtitles.py --all         # 모든 영상 자막 추출
"""

import json
import re
import sys
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    print("❌ yt-dlp 설치 필요: pip install yt-dlp")
    sys.exit(1)

# 경로 설정
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
VIDEOS_FILE = DATA_DIR / "videos.json"
SUBS_DIR = DATA_DIR / "subtitles"


def clean_vtt_content(content):
    """VTT 내용에서 텍스트만 추출"""
    # 타임스탬프 제거
    content = re.sub(r'\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}.*\n?', '', content)
    
    # VTT 헤더 제거
    content = re.sub(r'^WEBVTT\s*\n?', '', content)
    content = re.sub(r'^Kind:.*\n?', '', content, flags=re.MULTILINE)
    content = re.sub(r'^Language:.*\n?', '', content, flags=re.MULTILINE)
    
    # HTML 태그 제거
    content = re.sub(r'<[^>]+>', '', content)
    
    # HTML 엔티티 디코딩
    content = content.replace('&gt;', '>').replace('&lt;', '<').replace('&amp;', '&')
    
    # 위치 태그 제거
    content = re.sub(r'align:\w+\s*', '', content)
    content = re.sub(r'position:\d+%\s*', '', content)
    
    # 중복 제거 및 정리
    lines = content.split('\n')
    cleaned_lines = []
    prev_line = ''
    
    for line in lines:
        line = line.strip()
        if not line or re.match(r'^\d+$', line):
            continue
        if line != prev_line:
            cleaned_lines.append(line)
            prev_line = line
    
    return '\n'.join(cleaned_lines)


def extract_subtitle(video_id, output_dir):
    """영상에서 자막 추출하여 텍스트 파일로 저장"""
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 이미 추출된 경우 스킵
    txt_path = output_dir / f"{video_id}.txt"
    if txt_path.exists():
        print(f"⏭️  이미 존재: {video_id}")
        return True
    
    ydl_opts = {
        'outtmpl': str(output_dir / '%(id)s.%(ext)s'),
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': ['ko', 'en'],
        'subtitlesformat': 'vtt/best',
        'ignoreerrors': True,
        'nocheckcertificate': True,
        'prefer_insecure': True,
        'external_downloader': 'native',
        'quiet': True,
        'no_warnings': True,
    }
    
    print(f"📝 자막 추출: {video_id}...", end=" ", flush=True)
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])
        
        # VTT 파일 찾기 및 변환
        vtt_files = list(output_dir.glob(f"{video_id}*.vtt"))
        
        if vtt_files:
            # 첫 번째 VTT 파일 사용 (한국어 우선)
            ko_vtt = [f for f in vtt_files if '.ko.' in f.name]
            vtt_file = ko_vtt[0] if ko_vtt else vtt_files[0]
            
            with open(vtt_file, 'r', encoding='utf-8') as f:
                vtt_content = f.read()
            
            clean_text = clean_vtt_content(vtt_content)
            
            # TXT 저장
            with open(txt_path, 'w', encoding='utf-8') as f:
                f.write(clean_text)
            
            # VTT 삭제
            for vf in vtt_files:
                vf.unlink()
            
            print(f"✅ 완료 ({len(clean_text)} chars)")
            return True
        else:
            print("❌ 자막 없음")
            return False
            
    except Exception as e:
        print(f"❌ 에러: {e}")
        return False


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="YouTube 자막 추출 (GitHub Actions용)")
    parser.add_argument("--recent", type=int, help="최근 N개 영상만 추출")
    parser.add_argument("--all", action="store_true", help="모든 영상 추출")
    args = parser.parse_args()
    
    if not VIDEOS_FILE.exists():
        print(f"❌ videos.json 없음: {VIDEOS_FILE}")
        sys.exit(1)
    
    with open(VIDEOS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    videos = data.get('videos', [])
    
    # 최신순 정렬
    videos.sort(key=lambda v: v.get('uploadedAt', 0), reverse=True)
    
    if args.recent:
        videos = videos[:args.recent]
    elif not args.all:
        # 기본: 최근 20개
        videos = videos[:20]
    
    print(f"📺 {len(videos)}개 영상 자막 추출 시작...")
    print(f"📁 저장 위치: {SUBS_DIR}")
    print("-" * 50)
    
    success = 0
    failed = 0
    
    for video in videos:
        video_id = video.get('id')
        if not video_id:
            continue
        
        if extract_subtitle(video_id, SUBS_DIR):
            success += 1
        else:
            failed += 1
    
    print("-" * 50)
    print(f"✅ 완료: {success}개 성공, {failed}개 실패")


if __name__ == "__main__":
    main()
