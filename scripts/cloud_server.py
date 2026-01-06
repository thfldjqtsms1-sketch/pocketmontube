#!/usr/bin/env python3
"""Lightsail용 다운로드 서버 - HTML 파일 목록 페이지 포함"""
import os
os.environ['PATH'] = os.path.expanduser('~/.deno/bin') + ':' + os.environ.get('PATH', '')

import threading
from pathlib import Path
from datetime import datetime
import yt_dlp
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 설정
TOKEN = os.environ.get('DOWNLOAD_TOKEN', 'mytoken123')
DIR = Path(os.environ.get('DOWNLOAD_DIR', '/home/bitnami/downloads'))
DIR.mkdir(parents=True, exist_ok=True)

def check_token():
    """토큰 확인"""
    auth = request.headers.get('Authorization', '').replace('Bearer ', '')
    token = auth or request.args.get('token', '')
    return token == TOKEN

def dl(vid, mode):
    """다운로드 실행"""
    url = f"https://www.youtube.com/watch?v={vid}"
    opts = {
        "outtmpl": str(DIR / "%(title)s.%(ext)s"),
        "quiet": False,
        "cookiefile": os.path.expanduser("~/cookies.txt")
    }
    
    if mode == "video":
        opts["format"] = "best"
    elif mode == "audio":
        opts.update({
            "format": "bestaudio",
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}]
        })
    elif mode == "subs":
        opts.update({
            "skip_download": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["ko", "en"]
        })
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
        print(f"✅ 다운로드 완료: {vid}")
    except Exception as e:
        print(f"❌ 다운로드 실패: {vid} - {e}")

@app.route('/download', methods=['POST', 'OPTIONS'])
def download():
    if request.method == 'OPTIONS':
        return '', 204
    if not check_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json or {}
    video_id = data.get('videoId')
    mode = data.get('mode', 'video')
    
    if not video_id:
        return jsonify({'error': 'videoId required'}), 400
    
    threading.Thread(target=dl, args=(video_id, mode)).start()
    return jsonify({'success': True, 'message': f'다운로드 시작: {video_id} ({mode})'})

@app.route('/files')
def files():
    """파일 목록 (JSON 또는 HTML)"""
    if not check_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Accept 헤더 또는 format 파라미터로 출력 형식 결정
    accept = request.headers.get('Accept', '')
    fmt = request.args.get('format', '')
    
    files_list = []
    for f in DIR.iterdir():
        if f.is_file():
            stat = f.stat()
            files_list.append({
                'name': f.name,
                'size': stat.st_size,
                'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
    
    # 최신 파일 순으로 정렬
    files_list.sort(key=lambda x: x['modified'], reverse=True)
    
    if fmt == 'json' or 'application/json' in accept:
        return jsonify([f['name'] for f in files_list])
    
    # HTML 페이지 반환
    token = request.args.get('token', '')
    html = f'''<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📥 다운로드 파일 목록</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            padding: 20px;
            color: #fff;
        }}
        .container {{ max-width: 900px; margin: 0 auto; }}
        h1 {{ 
            text-align: center; 
            margin-bottom: 30px;
            font-size: 2rem;
            text-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }}
        .file-list {{ 
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            overflow: hidden;
        }}
        .file-item {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            transition: background 0.2s;
        }}
        .file-item:hover {{ background: rgba(255,255,255,0.1); }}
        .file-item:last-child {{ border-bottom: none; }}
        .file-info {{ flex: 1; min-width: 0; }}
        .file-name {{ 
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 4px;
        }}
        .file-meta {{ 
            font-size: 0.8rem;
            color: rgba(255,255,255,0.6);
        }}
        .download-btn {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            text-decoration: none;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-left: 16px;
            white-space: nowrap;
        }}
        .download-btn:hover {{
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }}
        .delete-btn {{
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            margin-left: 8px;
        }}
        .delete-btn:hover {{ opacity: 0.9; }}
        .empty {{ 
            text-align: center; 
            padding: 60px 20px;
            color: rgba(255,255,255,0.5);
        }}
        .refresh-btn {{
            display: block;
            margin: 20px auto;
            background: rgba(255,255,255,0.2);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
        }}
        .icon {{ margin-right: 8px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>📥 다운로드 파일 목록</h1>
        <div class="file-list">
'''
    
    if not files_list:
        html += '<div class="empty">📭 다운로드된 파일이 없습니다</div>'
    else:
        for f in files_list:
            name = f['name']
            size_mb = f['size'] / (1024 * 1024)
            
            # 파일 타입에 따른 아이콘
            if name.endswith('.mp4'):
                icon = '🎬'
            elif name.endswith('.mp3'):
                icon = '🎵'
            elif name.endswith('.vtt') or name.endswith('.srt'):
                icon = '📝'
            else:
                icon = '📄'
            
            html += f'''
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name"><span class="icon">{icon}</span>{name}</div>
                    <div class="file-meta">{size_mb:.1f} MB</div>
                </div>
                <a href="/files/{name}?token={token}" class="download-btn" download>⬇️ 다운로드</a>
            </div>
'''
    
    html += '''
        </div>
        <button class="refresh-btn" onclick="location.reload()">🔄 새로고침</button>
    </div>
</body>
</html>'''
    
    return Response(html, mimetype='text/html')

@app.route('/files/<path:filename>')
def get_file(filename):
    """파일 다운로드"""
    if not check_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    file_path = DIR / filename
    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    return send_file(file_path, as_attachment=True)

@app.route('/files/<path:filename>', methods=['DELETE'])
def delete_file(filename):
    """파일 삭제"""
    if not check_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    file_path = DIR / filename
    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        file_path.unlink()
        return jsonify({'success': True, 'message': f'Deleted: {filename}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health():
    """서버 상태 확인"""
    return jsonify({'status': 'ok', 'files_count': len(list(DIR.iterdir()))})

if __name__ == '__main__':
    print(f"📥 다운로드 서버 시작")
    print(f"📁 저장 경로: {DIR}")
    print(f"🔑 토큰: {TOKEN}")
    app.run(host='0.0.0.0', port=9527)
