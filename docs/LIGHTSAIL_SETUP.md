# PocketMonTube 다운로드 서버 - Lightsail 설치 가이드

## 1. Lightsail 서버 접속

SSH로 서버에 접속:
```bash
ssh -i 키파일.pem ubuntu@서버IP
```

## 2. 필수 패키지 설치

```bash
# Python 및 pip
sudo apt update
sudo apt install -y python3 python3-pip ffmpeg

# 서버 패키지
pip3 install yt-dlp flask flask-cors
```

## 3. 서버 파일 업로드

로컬에서 서버 파일 업로드:
```bash
scp -i 키파일.pem scripts/cloud_server.py ubuntu@서버IP:~/
```

## 4. 환경변수 설정

보안 토큰 설정 (직접 만든 토큰 사용):
```bash
export DOWNLOAD_TOKEN="여기에_나만의_비밀토큰_입력"
export DOWNLOAD_DIR="/home/ubuntu/downloads"
export PORT=9527
```

## 5. 서버 실행

### 테스트 실행:
```bash
python3 cloud_server.py
```

### 백그라운드 실행 (서버 꺼도 계속 실행):
```bash
nohup python3 cloud_server.py > server.log 2>&1 &
```

### systemd 서비스로 등록 (권장):
```bash
sudo nano /etc/systemd/system/download-server.service
```

내용:
```ini
[Unit]
Description=PocketMonTube Download Server
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu
Environment="DOWNLOAD_TOKEN=여기에_토큰"
Environment="DOWNLOAD_DIR=/home/ubuntu/downloads"
ExecStart=/usr/bin/python3 /home/ubuntu/cloud_server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

서비스 시작:
```bash
sudo systemctl daemon-reload
sudo systemctl enable download-server
sudo systemctl start download-server
```

## 6. 방화벽 설정

Lightsail 콘솔에서:
1. 인스턴스 클릭 → Networking 탭
2. "Add rule" 클릭
3. Application: Custom, Protocol: TCP, Port: 9527
4. Save

## 7. Chrome 확장 설정

확장 프로그램 팝업에서:
- 서버 URL: `http://서버IP:9527`
- 토큰: 위에서 설정한 토큰

## 테스트

```bash
# 상태 확인
curl http://서버IP:9527/

# 다운로드 테스트
curl -X POST http://서버IP:9527/download \
  -H "Authorization: Bearer 토큰" \
  -H "Content-Type: application/json" \
  -d '{"videoId":"dQw4w9WgXcQ","mode":"audio"}'

# 파일 목록
curl "http://서버IP:9527/files?token=토큰"
```

## 로그 확인

```bash
# systemd 사용 시
sudo journalctl -u download-server -f

# nohup 사용 시
tail -f server.log
```
