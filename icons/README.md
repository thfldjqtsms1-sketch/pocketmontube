# Icons

이 폴더에 다음 크기의 아이콘 파일을 준비해주세요:

- `icon16.png` - 16x16px (Toolbar 아이콘)
- `icon48.png` - 48x48px (Extension 관리 페이지)
- `icon128.png` - 128x128px (Chrome Web Store)

## 빠른 임시 아이콘 만들기

### 방법 1: 온라인 도구 사용
- https://www.favicon-generator.org/
- https://favicon.io/

### 방법 2: ImageMagick 사용 (Windows)
```bash
# 단색 아이콘 생성 예시
magick -size 128x128 xc:red -pointsize 72 -fill white -gravity center -annotate +0+0 "YT" icon128.png
magick icon128.png -resize 48x48 icon48.png
magick icon128.png -resize 16x16 icon16.png
```

### 방법 3: 무료 아이콘 다운로드
- https://icons8.com/
- https://www.flaticon.com/

## 추천 디자인
- YouTube 테마와 어울리는 빨간색 계열
- 간단하고 인식하기 쉬운 디자인
- 예: 폴더 아이콘 + YouTube 로고
