# MyTube Manager 🎬

YouTube 구독 채널을 그룹으로 관리하는 Chrome Extension (Manifest V3)

## ✨ 주요 기능

- 📁 **구독 그룹 관리**: YouTube 구독 채널을 사용자 정의 그룹으로 분류
- 🎯 **사이드바 통합**: YouTube 왼쪽 사이드바에 그룹 메뉴 추가
- ⚡ **실시간 동기화**: Popup과 Content Script 간 실시간 데이터 동기화
- 🎨 **현대적 UI**: React + Tailwind CSS 기반의 세련된 인터페이스

## 🛠️ 기술 스택 (2025 최신)

- **TypeScript 5.x** - 타입 안전성
- **Vite 5.x** - 초고속 빌드 도구
- **React 18+** - UI 프레임워크
- **Tailwind CSS 3.x** - 유틸리티 CSS
- **Chrome Extension Manifest V3** - 최신 표준
- **CRXJS Vite Plugin** - Extension 개발 최적화

## 📦 설치 및 실행

### 1. 의존성 설치

\`\`\`bash
npm install
\`\`\`

### 2. 개발 모드 실행

\`\`\`bash
npm run dev
\`\`\`

### 3. 프로덕션 빌드

\`\`\`bash
npm run build
\`\`\`

빌드 결과물은 `dist/` 폴더에 생성됩니다.

### 4. Chrome에 로드하기

1. Chrome 주소창에 `chrome://extensions/` 입력
2. 우측 상단 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `dist/` 폴더 선택

## 🎨 아이콘 준비

`icons/` 폴더에 다음 크기의 아이콘을 준비해주세요:

- `icon16.png` - 16x16px
- `icon48.png` - 48x48px
- `icon128.png` - 128x128px

**임시 방법**: 아이콘이 없으면 빌드 에러가 발생할 수 있습니다.
온라인 아이콘 생성기를 사용하거나, 간단한 이미지를 리사이즈해서 사용하세요.

## 📖 사용 방법

### 그룹 만들기

1. Extension 아이콘 클릭 → Popup 열기
2. "새 그룹" 버튼 클릭
3. 그룹 이름과 아이콘 선택
4. 채널 추가 (수동 입력 또는 YouTube 채널 페이지에서 자동 추가)

### 채널 추가하기

**방법 1**: 수동 추가
- Popup에서 채널 이름과 ID 입력

**방법 2**: 자동 추가 (추천)
- YouTube 채널 페이지로 이동
- Extension Popup 열기
- 원하는 그룹에 "+" 버튼 클릭

### 그룹 보기

- YouTube 왼쪽 사이드바에서 "구독 그룹" 섹션 확인
- 그룹 클릭하면 포함된 채널 목록 표시
- 채널 클릭하면 해당 채널 페이지로 이동

## 📁 프로젝트 구조

\`\`\`
pocketmontube/
├── src/
│   ├── manifest.json          # Extension 설정
│   ├── types/                 # TypeScript 타입 정의
│   ├── utils/                 # 유틸리티 함수
│   │   ├── storage.ts         # Chrome Storage 관리
│   │   └── youtube.ts         # YouTube DOM 파싱
│   ├── popup/                 # Popup UI
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── components/        # React 컴포넌트
│   ├── content/               # Content Scripts
│   │   ├── main.ts
│   │   ├── sidebar-injector.ts
│   │   └── styles.css
│   └── background/            # Background Service Worker
│       └── service-worker.ts
├── icons/                     # Extension 아이콘
├── dist/                      # 빌드 결과물 (자동 생성)
└── package.json
\`\`\`

## 🔧 개발 팁

### 타입 체크

\`\`\`bash
npm run type-check
\`\`\`

### 핫 리로드

개발 모드(`npm run dev`)에서는 파일 변경 시 자동으로 리빌드됩니다.
Extension을 새로고침하려면 `chrome://extensions/`에서 "새로고침" 버튼을 클릭하세요.

### 디버깅

- **Popup**: Popup 열기 → 우클릭 → "검사"
- **Content Script**: YouTube 페이지 → F12 → Console 탭
- **Background**: `chrome://extensions/` → "Service Worker" 링크 클릭

## 🐛 트러블슈팅

### 빌드 에러

- Node.js 버전 확인 (18.x 이상 권장)
- `node_modules` 삭제 후 `npm install` 재실행

### Extension이 작동하지 않음

- Chrome Extension 페이지에서 "새로고침" 클릭
- YouTube 페이지 새로고침 (F5)
- 개발자 도구 Console에서 에러 확인

### 사이드바에 그룹이 보이지 않음

- YouTube가 완전히 로드될 때까지 대기
- 페이지 새로고침
- Content Script 주입 확인 (Console에 "[MyTube]" 로그 확인)

## 🤖 GitHub Actions 자동 수집

이 프로젝트는 GitHub Actions를 통해 매시간 자동으로 YouTube 영상을 수집합니다.

### 설정 방법

1. **GitHub 리포지토리 생성**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **채널 목록 내보내기**
   - Chrome Extension에서 YouTube 홈페이지로 이동
   - "구독 그룹" 섹션에서 "내보내기" 버튼 클릭
   - `channels.json` 파일 다운로드
   - 다운로드한 파일을 `data/channels.json`에 저장
   - Git에 커밋 및 푸시:
     ```bash
     git add data/channels.json
     git commit -m "Add channels list"
     git push
     ```

3. **GitHub Actions 활성화**
   - GitHub 리포지토리 페이지에서 "Actions" 탭 클릭
   - "I understand my workflows, go ahead and enable them" 클릭
   - 워크플로우가 매시간 자동으로 실행됩니다

4. **수동 실행**
   - GitHub 리포지토리 → Actions 탭
   - "Collect YouTube Videos" 워크플로우 선택
   - "Run workflow" 버튼 클릭

### 작동 원리

1. **자동 수집** (매시간)
   - GitHub Actions가 `npm run collect` 실행
   - 모든 채널의 RSS 피드에서 새 영상 수집
   - 영상 상세 정보 업데이트 (조회수, duration, Shorts 여부)
   - `data/videos.json` 파일에 결과 저장
   - 자동으로 커밋 및 푸시

2. **Chrome Extension 동기화**
   - YouTube 홈페이지에서 "GitHub 동기화" 버튼 클릭
   - GitHub의 `data/videos.json`에서 최신 데이터 가져오기
   - 로컬 스토리지와 병합

### 데이터 파일 구조

- `data/channels.json` - 그룹 및 채널 목록
- `data/videos.json` - 수집된 영상 데이터

## 📱 Telegram 바이럴 영상 알림

매시간 영상 수집 후, 바이럴 지수가 높은 영상을 Telegram으로 자동 알림 받을 수 있습니다.

### 설정 방법

1. **Telegram Bot 생성**
   - Telegram에서 [@BotFather](https://t.me/BotFather) 검색
   - `/newbot` 명령어 입력
   - Bot 이름 입력 (예: `PocketMonTube Viral Notifier`)
   - Bot username 입력 (예: `pocketmontube_bot`)
   - Bot Token 복사 (예: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

2. **Chat ID 확인**
   - [@userinfobot](https://t.me/userinfobot) 검색
   - `/start` 명령어 입력
   - Chat ID 복사 (예: `123456789`)

3. **GitHub Secrets 설정**
   - GitHub 리포지토리 → Settings → Secrets and variables → Actions
   - "New repository secret" 클릭
   - `TELEGRAM_BOT_TOKEN`: Bot Token 입력
   - `TELEGRAM_CHAT_ID`: Chat ID 입력

4. **바이럴 임계값 조정** (선택사항)
   - `.github/workflows/collect-videos.yml` 파일 수정
   - `VIRAL_THRESHOLD`: 기본값 500/h (시간당 조회수)
   - `TOP_VIRAL_COUNT`: 기본값 10개 (상위 몇 개 알림)

### 알림 예시

```
🔥 바이럴 영상 알림 🔥

1. 영상 제목
   📺 채널 이름
   👁 1.5만회 · 🔥 1.2천/h
   ⏰ 12시간 전
   🔗 영상 보기

2. ...

📊 마지막 업데이트: 2026-01-06 01:00:00
```

## 📝 할 일 (TODO)

- [ ] 그룹별 피드 필터링 (Main Feed에 그룹 Shelf 추가)
- [ ] 드래그 앤 드롭으로 채널 이동
- [ ] 그룹 색상 커스터마이징
- [x] 데이터 백업/복원 기능 (GitHub 동기화)
- [ ] 구독 채널 자동 감지 및 추천
- [ ] 키보드 단축키

## 📄 라이선스

MIT License - 개인 사용 목적으로 자유롭게 사용 가능합니다.

## 🙏 기여

이 프로젝트는 개인 사용 목적으로 만들어졌습니다.
개선 사항이나 버그를 발견하면 자유롭게 수정해서 사용하세요!
