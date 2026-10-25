/** Validate central directory before JSZip can overwrite duplicate paths or inflate entries. */
export function inspectZip(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer),
    v = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      v.getUint32(i, true) === 0x06054b50 &&
      i + 22 + v.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw Error("Invalid ZIP directory");
  if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true))
    throw Error("Multi-volume backups are unsupported");
  const count = v.getUint16(end + 10, true),
    size = v.getUint32(end + 12, true),
    start = v.getUint32(end + 16, true);
  if (count === 65535 || size === 0xffffffff || start === 0xffffffff)
    throw Error("ZIP64 backups are unsupported; original backup is unchanged");
  if (start + size !== end || v.getUint16(end + 8, true) !== count)
    throw Error("Invalid ZIP directory size");
  const seen = new Set<string>(),
    decode = new TextDecoder("utf-8", { fatal: true });
  let pos = start,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || v.getUint32(pos, true) !== 0x02014b50)
      throw Error("Invalid ZIP entry");
    const flags = v.getUint16(pos + 8, true),
      method = v.getUint16(pos + 10, true),
      expanded = v.getUint32(pos + 24, true),
      nameLength = v.getUint16(pos + 28, true),
      extra = v.getUint16(pos + 30, true),
      comment = v.getUint16(pos + 32, true);
    if (flags & 1 || ![0, 8].includes(method))
      throw Error("Encrypted or unsupported ZIP compression");
    if (pos + 46 + nameLength + extra + comment > end)
      throw Error("Truncated ZIP entry");
    const name = decode.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    if (seen.has(name)) throw Error("Duplicate backup entry");
    seen.add(name);
    if (
      name !== "remo.json" &&
      (!/^(media|emoji)\/[A-Za-z0-9._-]+$/.test(name) ||
        [".", ".."].includes(name.split("/")[1]))
    )
      throw Error("Unsafe backup entry");
    if (expanded > 64 * 1024 * 1024) throw Error("Oversized backup entry");
    total += expanded;
    if (total > 1024 * 1024 * 1024 + 64 * 1024 * 1024)
      throw Error("Expanded backup exceeds limit");
    pos += 46 + nameLength + extra + comment;
  }
  if (pos !== end || !seen.has("remo.json"))
    throw Error("Incomplete ZIP directory");
}
