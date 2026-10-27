const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. Write icon.svg
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="50%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
    <linearGradient id="bookCover" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="spineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#b45309"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <filter id="dropShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect width="512" height="512" rx="115" fill="url(#bgGrad)"/>

  <g filter="url(#dropShadow)" transform="translate(106, 86)">
    <rect x="20" y="0" width="280" height="340" rx="20" fill="url(#bookCover)"/>
    <rect x="0" y="0" width="46" height="340" rx="10" fill="url(#spineGrad)"/>
    <circle cx="23" cy="60" r="9" fill="#1e3a8a"/>
    <circle cx="23" cy="130" r="9" fill="#1e3a8a"/>
    <circle cx="23" cy="200" r="9" fill="#1e3a8a"/>
    <circle cx="23" cy="270" r="9" fill="#1e3a8a"/>
    <polygon points="210,0 236,0 236,90 223,76 210,90" fill="#ef4444"/>
    <rect x="74" y="65" width="180" height="120" rx="12" fill="#ffffff" opacity="0.95"/>
    <line x1="94" y1="95" x2="234" y2="95" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
    <line x1="94" y1="125" x2="234" y2="125" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
    <line x1="94" y1="155" x2="184" y2="155" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
    <circle cx="164" cy="245" r="42" fill="#ffffff" opacity="0.2"/>
    <text x="164" y="263" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="900" fill="#ffffff" text-anchor="middle">₹</text>
  </g>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent, 'utf8');

// CRC32 table
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const typeAndData = buf.subarray(4, 8 + len);
  buf.writeUInt32BE(crc32(typeAndData), 8 + len);
  return buf;
}

function generatePNG(size, isMaskable = false) {
  // Generate RGBA buffer
  const scanlineLength = 1 + size * 4;
  const rawData = Buffer.alloc(scanlineLength * size);

  // Center coordinate
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.22; // corner radius for squircle if not maskable
  const bookW = size * 0.55;
  const bookH = size * 0.68;
  const bookLeft = (size - bookW) / 2;
  const bookTop = (size - bookH) / 2;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type: None

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Background color: Gradient from #2563eb to #1e3a8a
      const t = (x + y) / (size * 2);
      let r = Math.round(37 * (1 - t) + 30 * t);
      let g = Math.round(99 * (1 - t) + 58 * t);
      let b = Math.round(235 * (1 - t) + 138 * t);
      let a = 255;

      // Check if inside book
      if (x >= bookLeft && x <= bookLeft + bookW && y >= bookTop && y <= bookTop + bookH) {
        // Spine (left ~15% of book)
        if (x <= bookLeft + bookW * 0.16) {
          r = 180; g = 83; b = 9; // Spine brown-amber
          // Spine binder notch
          const notchY = (y - bookTop) / bookH;
          if (Math.abs(x - (bookLeft + bookW * 0.08)) < size * 0.02 &&
              (Math.abs(notchY - 0.2) < 0.03 || Math.abs(notchY - 0.4) < 0.03 ||
               Math.abs(notchY - 0.6) < 0.03 || Math.abs(notchY - 0.8) < 0.03)) {
            r = 30; g = 58; b = 138;
          }
        } else {
          // Book cover (amber #f59e0b to #d97706)
          r = 245; g = 158; b = 11;

          // Bookmark ribbon (red) at top right
          if (x >= bookLeft + bookW * 0.65 && x <= bookLeft + bookW * 0.76 && y <= bookTop + bookH * 0.3) {
            r = 239; g = 68; b = 68;
          }
          // White label in upper half
          else if (x >= bookLeft + bookW * 0.24 && x <= bookLeft + bookW * 0.88 &&
                   y >= bookTop + bookH * 0.18 && y <= bookTop + bookH * 0.52) {
            r = 255; g = 255; b = 255;
            // Ruled lines in label
            const ly = (y - (bookTop + bookH * 0.18)) / (bookH * 0.34);
            if ((Math.abs(ly - 0.28) < 0.025 || Math.abs(ly - 0.55) < 0.025 || Math.abs(ly - 0.8) < 0.025) &&
                x >= bookLeft + bookW * 0.3 && x <= bookLeft + bookW * 0.82) {
              r = 203; g = 213; b = 225; // light blue-gray
            }
          }
          // Center Rupee emblem in lower half
          else {
            const rx = x - (bookLeft + bookW * 0.56);
            const ry = y - (bookTop + bookH * 0.74);
            const dist = Math.sqrt(rx * rx + ry * ry);
            if (dist < size * 0.09) {
              // Emblem circle
              r = 255; g = 255; b = 255;
              if (dist < size * 0.075 && Math.abs(rx) < size * 0.04 && Math.abs(ry) < size * 0.04) {
                r = 217; g = 119; b = 6; // inner contrast
              }
            }
          }
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  // PNG Header
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0; // Compression: Deflate
  ihdrData[11] = 0; // Filter: None
  ihdrData[12] = 0; // Interlace: None
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = createChunk('IDAT', compressed);

  // IEND
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), generatePNG(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), generatePNG(512));
fs.writeFileSync(path.join(iconsDir, 'icon-maskable-192.png'), generatePNG(192, true));
fs.writeFileSync(path.join(iconsDir, 'icon-maskable-512.png'), generatePNG(512, true));

console.log('✅ Icons generated successfully!');
