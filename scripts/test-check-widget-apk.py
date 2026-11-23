"""Regression fixtures for release-resource validation (UTF-8 and UTF-16 pools)."""
import importlib.util
import io
from pathlib import Path
import struct
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('apk_check', Path(__file__).with_name('check-widget-apk.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def apk(names, utf8):
    strings = bytearray()
    offsets = []
    for name in sorted(names):
        offsets.append(len(strings))
        if utf8:
            value = name.encode()
            strings.extend(bytes([len(name), len(value)]) + value + b'\0')
        else:
            strings.extend(struct.pack('<H', len(name)) + name.encode('utf-16le') + b'\0\0')
    begin = 28 + 4 * len(offsets)
    pool = struct.pack('<HHIIIIII', 1, 28, begin + len(strings), len(offsets), 0, 0x100 if utf8 else 0, begin, 0)
    pool += b''.join(struct.pack('<I', offset) for offset in offsets) + strings
    table = struct.pack('<HHII', 2, 12, 12 + len(pool), 0) + pool
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w') as archive:
        archive.writestr('resources.arsc', table)
    result.seek(0)
    return result


class ReleaseResourcesTest(unittest.TestCase):
    def test_complete_release_resources(self):
        for utf8 in (True, False):
            module.check(apk(module.expected_names(), utf8))

    def test_stripped_runtime_colour_rejects_release(self):
        names = module.expected_names() - {'widget_iris_primary'}
        with self.assertRaisesRegex(ValueError, 'widget_iris_primary'):
            module.check(apk(names, True))

    def test_malformed_table_rejected(self):
        with self.assertRaises(ValueError):
            module.resource_names(struct.pack('<HHI', 2, 12, 0))


if __name__ == '__main__':
    unittest.main()
