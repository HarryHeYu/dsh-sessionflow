// Turn a DSH session log into a readable, reproducible transcript.
//
//   node dsh-trace.mjs <session.v3.jsonl.zstd> [--full]
//
// DSH writes its session log as a *multi-frame* zstd stream: one zstd frame per
// append.  Node's zstdDecompressSync stops after the first frame, which yields
// only the 199-byte header record and makes it look like the session is empty.
// This walks the frame magic instead.
//
// The output is derived entirely from the log -- no step is re-narrated by hand,
// which is the point: a demo that claims "the agent used sessionFlow" has to be
// checkable against the record.

import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function readSessionLog(path) {
  const buf = readFileSync(path);
  const offsets = [];
  let i = 0;
  while ((i = buf.indexOf(MAGIC, i)) !== -1) { offsets.push(i); i += 4; }
  let out = Buffer.alloc(0);
  for (let k = 0; k < offsets.length; k++) {
    const end = k + 1 < offsets.length ? offsets[k + 1] : buf.length;
    out = Buffer.concat([out, zstdDecompressSync(buf.subarray(offsets[k], end))]);
  }
  return out.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

const oneLine = (s, n) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);

const path = process.argv[2];
if (!path) { console.error('usage: dsh-trace.mjs <session.v3.jsonl.zstd>'); process.exit(2); }
const recs = readSessionLog(path);

const calls = new Map();          // callId -> { name, args }
const lines = [];
let n = 0;

for (const r of recs) {
  const d = r.data || {};
  if (r.type === 'user/message' && d.source?.kind === 'user') {
    lines.push(`\n[user] ${oneLine(d.content?.[0]?.text ?? '', 400)}\n`);
  } else if (r.type === 'assistant/message') {
    const text = (d.content || []).filter((c) => c.type === 'text')
      .map((c) => c.text).join(' ');
    if (text.trim()) lines.push(`  [assistant] ${oneLine(text, 260)}`);
  } else if (r.type === 'tool/call') {
    n += 1;
    let args = '';
    try { args = oneLine(JSON.stringify(JSON.parse(d.arguments || '{}')), 120); }
    catch { args = oneLine(d.arguments || '', 120); }
    calls.set(d.callId, { name: d.name, args });
    const tag = d.name.startsWith('sessionflow_') ? '  <<< sessionFlow' : '';
    lines.push(`  ${String(n).padStart(2)}. ${d.name}(${args})${tag}`);
  } else if (r.type === 'tool/result') {
    const id = d.message?.source?.callId;
    const info = calls.get(id);
    const text = (d.message?.content?.[0]?.content || [])
      .map((c) => c.text ?? '').join(' ');
    if (info?.name.startsWith('sessionflow_')) {
      lines.push(`      -> ${oneLine(text, 400)}`);
    }
  }
}

const sessionflowCalls = [...calls.values()].filter((c) => c.name.startsWith('sessionflow_'));
console.log(`session: ${recs.find((r) => r.type === 'session')?.cwd}`);
console.log(`records: ${recs.length}   tool calls: ${n}   sessionFlow calls: ${sessionflowCalls.length}`);
console.log(lines.join('\n'));
