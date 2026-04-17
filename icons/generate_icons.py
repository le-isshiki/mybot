#!/usr/bin/env python3
"""Generate simple PNG icons for the Chrome extension using only stdlib."""
import struct, zlib, math

def make_png(size, color_fn):
    """Create a minimal PNG with a chart-like icon."""
    img = []
    for y in range(size):
        row = []
        for x in range(size):
            r, g, b, a = color_fn(x, y, size)
            row += [r, g, b, a]
        img.append(bytes(row))

    def pack_chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', c)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    raw  = b''.join(b'\x00' + row for row in img)
    idat = zlib.compress(raw, 9)

    return (b'\x89PNG\r\n\x1a\n'
            + pack_chunk(b'IHDR', ihdr)
            + pack_chunk(b'IDAT', idat)
            + pack_chunk(b'IEND', b''))

def icon_color(x, y, s):
    # Dark background
    bg = (13, 17, 23, 255)
    green = (63, 185, 80, 255)
    red   = (248, 81, 73, 255)
    accent = (88, 166, 255, 255)

    cx, cy = s / 2, s / 2
    r = math.sqrt((x - cx)**2 + (y - cy)**2)
    margin = s * 0.05

    # Outer circle
    outer = s * 0.48
    inner = s * 0.40
    if r > outer or x < margin or x > s - margin or y < margin or y > s - margin:
        return (0, 0, 0, 0)  # transparent

    # Chart line: simple zigzag
    pts = [(0.15, 0.65), (0.30, 0.35), (0.50, 0.55), (0.70, 0.25), (0.85, 0.45)]
    px = [(int(p[0] * s), int(p[1] * s)) for p in pts]

    for i in range(len(px) - 1):
        x1, y1 = px[i]
        x2, y2 = px[i + 1]
        # Check if (x, y) is near this segment
        dx, dy = x2 - x1, y2 - y1
        length = math.sqrt(dx*dx + dy*dy)
        if length < 1: continue
        t = max(0, min(1, ((x - x1)*dx + (y - y1)*dy) / (length**2)))
        nx, ny = x1 + t*dx, y1 + t*dy
        dist = math.sqrt((x - nx)**2 + (y - ny)**2)
        thick = max(1, s * 0.04)
        if dist < thick:
            col = green if i % 2 == 0 else accent
            alpha = int(255 * max(0, 1 - dist / thick))
            return (*col[:3], alpha)

    # Inner background
    return (22, 27, 34, 200)

for size in [16, 48, 128]:
    png = make_png(size, icon_color)
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(png)
    print(f'Generated icon{size}.png')

print('Icons generated successfully.')
