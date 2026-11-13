const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
class RecordingLibrary {
  constructor(directory) { this.directory = directory; }
  file(id) {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('无效的录制编号。');
    return path.join(this.directory, id + '.json');
  }
  async add(data) {
    const content = JSON.stringify(data, null, 2) + '\n';
    const id = createHash('sha256').update(content).digest('hex');
    await fs.mkdir(this.directory, { recursive:true });
    try { await fs.writeFile(this.file(id), content, {flag:'wx'}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return id;
  }
  async list() {
    await fs.mkdir(this.directory, {recursive:true});
    const entries = [];
    for (const name of await fs.readdir(this.directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        const file = path.join(this.directory,name), stat = await fs.stat(file);
        if (stat.size > 5_000_000) continue;
        const data = JSON.parse(await fs.readFile(file,'utf8'));
        entries.push({id:name.slice(0,-5),title:typeof data.title === 'string' && data.title || '未命名流程',
          fileName:data.id && /^[a-zA-Z0-9-]+$/.test(data.id) && data.startedAt ? `wrr-${String(data.startedAt).slice(0,10)}-${data.id.slice(0,8)}.json` : name,
          steps:(data.steps || []).length + (data.branches || []).reduce((n,b)=>n+b.steps.length,0),
          savedAt:stat.mtime.toISOString()});
      } catch { /* A damaged file must not hide the rest of the local library. */ }
    }
    return entries.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
  }
}
module.exports = { RecordingLibrary };
