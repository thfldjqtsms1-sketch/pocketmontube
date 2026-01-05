/**
 * Placeholder 아이콘 생성 스크립트
 * 실제 프로덕션에서는 디자이너가 만든 아이콘을 사용하세요!
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, '../public/icons');

// 디렉토리 생성
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 간단한 SVG를 PNG로 변환하는 대신,
// Base64 인코딩된 1x1 빨간 픽셀 PNG 생성
const createSimplePNG = (size) => {
  // 1x1 빨간 PNG의 Base64 (최소 크기)
  const base64PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  return Buffer.from(base64PNG, 'base64');
};

// 아이콘 생성
['16', '48', '128'].forEach(size => {
  const filename = `icon${size}.png`;
  const filepath = path.join(iconsDir, filename);
  fs.writeFileSync(filepath, createSimplePNG(size));
  console.log(`✓ Generated ${filename}`);
});

console.log('\n⚠️  Placeholder icons generated!');
console.log('For production, replace with proper icons in public/icons/');
