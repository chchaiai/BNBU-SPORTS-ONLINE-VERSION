import { crc32 } from 'node:zlib';

/** Small ZIP writer for fixed server-selected files; STORE avoids compression CPU spikes. */
export function runtimeLogZip(entries: readonly { name: string; bytes: Buffer }[]) {
  if (entries.length < 1 || entries.length > 16 || new Set(entries.map(e=>e.name)).size!==entries.length)
    throw new Error('RUNTIME_ARCHIVE_INVALID');
  const locals:Buffer[]=[],central:Buffer[]=[];
  let offset=0;
  for (const entry of entries) {
    if (!/^[a-z][a-z0-9-]*\.(json|ndjson)$/u.test(entry.name) || entry.bytes.length>80*1024*1024) throw new Error('RUNTIME_ARCHIVE_INVALID');
    const name=Buffer.from(entry.name),checksum=crc32(entry.bytes),local=Buffer.alloc(30),directory=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(0x21,12);
    local.writeUInt32LE(checksum,14);local.writeUInt32LE(entry.bytes.length,18);local.writeUInt32LE(entry.bytes.length,22);local.writeUInt16LE(name.length,26);
    directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(0x21,14);
    directory.writeUInt32LE(checksum,16);directory.writeUInt32LE(entry.bytes.length,20);directory.writeUInt32LE(entry.bytes.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
    locals.push(local,name,entry.bytes);central.push(directory,name);offset+=local.length+name.length+entry.bytes.length;
    if (offset>80*1024*1024) throw new Error('RUNTIME_ARCHIVE_TOO_LARGE');
  }
  const centralBytes=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,centralBytes,end]);
}
