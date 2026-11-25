"""Reject signed APKs with widget resources removed by release optimisation."""
import json
from pathlib import Path
import struct
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def resource_names(data):
    names = set()

    def length(offset, wide=False):
        unit, mask = (2, 0x8000) if wide else (1, 0x80)
        first = int.from_bytes(data[offset:offset + unit], 'little')
        offset += unit
        if first & mask:
            second = int.from_bytes(data[offset:offset + unit], 'little')
            return ((first & (mask - 1)) << (unit * 8)) | second, offset + unit
        return first, offset

    def chunks(start, end):
        while start < end:
            kind, header, size = struct.unpack_from('<HHI', data, start)
            if header < 8 or size < header or start + size > end:
                raise ValueError('Invalid Android resource table chunk')
            if kind in (0x0002, 0x0200):  # table / package
                chunks(start + header, start + size)
            elif kind == 0x0001:  # Android string pool, including package key names
                count, _, flags, strings_start, _ = struct.unpack_from('<IIIII', data, start + 8)
                for index in range(count):
                    relative = struct.unpack_from('<I', data, start + header + index * 4)[0]
                    offset = start + strings_start + relative
                    if flags & 0x100:
                        _, offset = length(offset)  # UTF-16 character count
                        size_bytes, offset = length(offset)
                        text = data[offset:offset + size_bytes].decode('utf-8')
                    else:
                        characters, offset = length(offset, True)
                        text = data[offset:offset + characters * 2].decode('utf-16le')
                    names.add(text)
            start += size
    chunks(0, len(data))
    return names


def expected_names():
    tokens = json.loads((ROOT / 'docs/widgets/palettes.json').read_text())
    roles = list(tokens['roles']) + list(tokens['grades']['light'])
    names = {f'widget_{palette}_{role.lower()}' for palette in tokens['palettes'] for role in roles}
    drawables = ROOT / 'src-tauri/gen/android/app/src/main/res/drawable'
    names.update(path.stem for path in drawables.glob('widget_*.xml'))
    for directory in ('layout','xml'):
        names.update(path.stem for path in (drawables.parent / directory).glob('widget_suite_*.xml'))
    return names


def check(apk):
    with zipfile.ZipFile(apk) as archive:
        present = resource_names(archive.read('resources.arsc'))
    missing = sorted(expected_names() - present)
    if missing:
        raise ValueError(f'APK is missing {len(missing)} widget resources: ' + ', '.join(missing[:12]))
    print(f'APK retains all {len(expected_names())} required widget resources')


if __name__ == '__main__':
    check(sys.argv[1])
