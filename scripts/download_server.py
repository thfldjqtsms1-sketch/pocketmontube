#!/usr/bin/env python3
"""
PocketMonTube - 다운로드 서버
Chrome 확장 프로그램에서 바로 다운로드 요청을 받아 처리

사용법:
  1. 이 서버 실행: python download_server.py
  2. Chrome 확장에서 다운로드 버튼 클릭
  3. 자동으로 다운로드 시작!

요구사항:
  - pip install yt-dlp flask flask-cors
  - FFmpeg 설치 (없으면 720p 제한)
"""

import os
import sys
import re
import threading
from pathlib import Path
from datetime import datetime

try:
    import yt_dlp
except ImportError:
    print("❌ yt-dlp가 설치되어 있지 않습니다.")
    print("   설치: pip install yt-dlp")
    sys.exit(1)

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("❌ Flask가 설치되어 있지 않습니다.")
    print("   설치: pip install flask flask-cors")
    sys.exit(1)

app = Flask(__name__)
CORS(app)  # Chrome 확장에서 접근 가능하게

# 다운로드 폴더
DOWNLOAD_DIR = Path(__file__).parent.parent / "downloads"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 다운로드 상태 추적
download_status = {}


def clean_vtt_to_text(vtt_path):
    """VTT 파일에서 텍스트만 추출하여 정리된 txt 파일 생성"""
    vtt_path = Path(vtt_path)
    if not vtt_path.exists():
        return None
    
    with open(vtt_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # VTT 헤더 제거
    content = re.sub(r'^WEBVTT\s*\n?', '', content)
    content = re.sub(r'^Kind:.*\n?', '', content, flags=re.MULTILINE)
    content = re.sub(r'^Language:.*\n?', '', content, flags=re.MULTILINE)
    
    # 타임스탬프 라인 제거 (00:00:34.549 --> 00:00:34.559 align:start position:0%)
    content = re.sub(r'\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}[^\n]*\n?', '', content)
    
    # 인라인 타임스탬프 태그 제거 (<00:00:34.960> 등)
    content = re.sub(r'<\d{2}:\d{2}:\d{2}\.\d{3}>', '', content)
    
    # <c>, </c> 태그 제거
    content = re.sub(r'</?c>', '', content)
    
    # 모든 HTML 태그 제거
    content = re.sub(r'<[^>]+>', '', content)
    
    # HTML 엔티티 디코딩 (&gt; -> >, &lt; -> <, &amp; -> &)
    content = content.replace('&gt;', '>').replace('&lt;', '<').replace('&amp;', '&')
    
    # >> 화자 표시 제거
    content = re.sub(r'^>>\s*', '', content, flags=re.MULTILINE)
    
    # 위치/정렬 태그 제거 (align:start position:0% 등)
    content = re.sub(r'align:\w+\s*', '', content)
    content = re.sub(r'position:\d+%\s*', '', content)
    
    # 빈 줄과 공백 정리
    lines = content.split('\n')
    cleaned_lines = []
    prev_line = ''
    
    for line in lines:
        line = line.strip()
        # 빈 줄, 숫자만 있는 줄(큐 번호) 제거
        if not line or re.match(r'^\d+$', line):
            continue
        # 중복 줄 제거
        if line != prev_line:
            cleaned_lines.append(line)
            prev_line = line
    
    # 정리된 텍스트
    clean_text = '\n'.join(cleaned_lines)
    
    # txt 파일로 저장
    txt_path = vtt_path.with_suffix('.txt')
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(clean_text)
    
    # VTT 파일 삭제 (TXT만 남김)
    try:
        vtt_path.unlink()
        print(f"🗑️ VTT 삭제: {vtt_path.name}")
    except:
        pass
    
    print(f"📝 텍스트 추출 완료: {txt_path}")
    return txt_path


def get_download_options(mode, save_path):
    """다운로드 옵션 생성"""
    base_opts = {
        'outtmpl': str(save_path / '%(title)s.%(ext)s'),
        'progress_hooks': [lambda d: update_progress(d)],
        'quiet': False,
        'nocheckcertificate': True,  # SSL 인증서 검증 비활성화
    }
    
    if mode == 'video':
        # 최고 화질 영상 + 오디오 합치기
        return {
            **base_opts,
            'format': 'bestvideo+bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegVideoConvertor',
                'preferedformat': 'mp4',
            }],
        }
    elif mode == 'audio':
        # MP3 추출
        return {
            **base_opts,
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': str(save_path / 'audio' / '%(title)s.%(ext)s'),
        }
    elif mode == 'subs':
        # 자막 추출 (없어도 에러 안 남)
        subs_path = save_path / 'subs'
        subs_path.mkdir(parents=True, exist_ok=True)
        return {
            'outtmpl': str(subs_path / '%(title)s.%(ext)s'),
            'skip_download': True,
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['ko', 'en'],
            'subtitlesformat': 'best',
            'ignoreerrors': True,
            'nocheckcertificate': True,
            'prefer_insecure': True,  # HTTPS 대신 HTTP 사용
            'external_downloader': 'native',  # curl 대신 Python urllib 사용
            'quiet': False,
        }
    
    return base_opts


def update_progress(d):
    """다운로드 진행 상황 업데이트"""
    if 'video_id' in d.get('info_dict', {}):
        video_id = d['info_dict']['video_id']
        if d['status'] == 'downloading':
            download_status[video_id] = {
                'status': 'downloading',
                'percent': d.get('_percent_str', '0%'),
                'speed': d.get('_speed_str', 'N/A'),
            }
        elif d['status'] == 'finished':
            download_status[video_id] = {
                'status': 'finished',
                'filename': d.get('filename', ''),
            }


def do_download(video_id, mode):
    """백그라운드에서 다운로드 실행"""
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    save_path = DOWNLOAD_DIR / mode
    save_path.mkdir(parents=True, exist_ok=True)
    
    opts = get_download_options(mode, DOWNLOAD_DIR)
    
    download_status[video_id] = {'status': 'starting'}
    
    print(f"\n⬇️  다운로드 시작: {video_id} ({mode})")
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([video_url])
        
        # 자막인 경우 VTT -> 텍스트 변환
        if mode == 'subs':
            subs_dir = DOWNLOAD_DIR / 'subs'
            for vtt_file in subs_dir.glob('*.vtt'):
                clean_vtt_to_text(vtt_file)
        
        download_status[video_id] = {'status': 'completed'}
        print(f"✅ 다운로드 완료: {video_id}")
        
    except Exception as e:
        download_status[video_id] = {'status': 'error', 'error': str(e)}
        print(f"❌ 다운로드 실패: {video_id} - {e}")


@app.route('/download', methods=['POST', 'OPTIONS'])
def download():
    """다운로드 요청 처리"""
    if request.method == 'OPTIONS':
        return '', 204
    
    data = request.json
    video_id = data.get('videoId')
    mode = data.get('mode', 'video')  # video, audio, subs
    
    if not video_id:
        return jsonify({'success': False, 'error': 'videoId required'}), 400
    
    # 백그라운드 스레드에서 다운로드 시작
    thread = threading.Thread(target=do_download, args=(video_id, mode))
    thread.start()
    
    return jsonify({
        'success': True,
        'message': f'다운로드 시작됨: {video_id} ({mode})',
        'downloadDir': str(DOWNLOAD_DIR),
    })


@app.route('/status/<video_id>', methods=['GET'])
def status(video_id):
    """다운로드 상태 확인"""
    if video_id in download_status:
        return jsonify(download_status[video_id])
    return jsonify({'status': 'unknown'})


@app.route('/health', methods=['GET'])
def health():
    """서버 상태 확인"""
    return jsonify({
        'status': 'ok',
        'downloadDir': str(DOWNLOAD_DIR),
        'time': datetime.now().isoformat(),
    })


if __name__ == '__main__':
    print("=" * 50)
    print("PocketMonTube Download Server")
    print("=" * 50)
    print(f"Download Dir: {DOWNLOAD_DIR}")
    print(f"Server URL: http://localhost:9527")
    print("")
    print("Press Ctrl+C to stop")
    print("=" * 50)

    app.run(host='127.0.0.1', port=9527, debug=False)
