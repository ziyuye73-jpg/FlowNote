const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `Python exited ${code}`)));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

class WorkflowStore {
  constructor(root) { this.root = root; this.recording = null; this.python = null; }
  async runtime() {
    if (this.python) return this.python;
    const candidates = process.env.FLOWNOTE_PYTHON ? [[process.env.FLOWNOTE_PYTHON]] :
      process.platform === 'win32' ? [['py', '-3'], ['python3'], ['python']] :
        [['/opt/homebrew/bin/python3'], ['/usr/local/bin/python3'], ['/Library/Frameworks/Python.framework/Versions/Current/bin/python3'], ['python3'], ['python']];
    for (const [command, ...args] of candidates) {
      try {
        await run(command, [...args, '-c', 'import sys; sys.exit(sys.version_info < (3,10))']);
        return (this.python = { command, args });
      } catch { /* Try the next installed interpreter. */ }
    }
    throw new Error('需要 Python 3.10+。安装 Python，或设置 FLOWNOTE_PYTHON 后重新打开客户端。');
  }
  async validate(data) {
    const input = JSON.stringify(data);
    if (Buffer.byteLength(input) > 5_000_000) throw new Error('录制文件不能超过 5 MB。');
    const { command, args } = await this.runtime();
    const code = 'import sys,json; sys.path.insert(0,sys.argv[1]); from recording_to_skill import convert; print(json.dumps(convert(json.load(sys.stdin),"desktop-preview"),ensure_ascii=True))';
    return JSON.parse(await run(command, [...args, '-c', code, path.join(this.root, 'scripts')], input));
  }
  async importFile(file) {
    if ((await fs.stat(file)).size > 5_000_000) throw new Error('录制文件不能超过 5 MB。');
    const data = JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
    await this.validate(data);
    this.recording = data;
    return data;
  }
  async update(data) {
    await this.validate(data);
    this.recording = data;
    return data;
  }
  async exportSkill(parent, name) {
    if (!this.recording) throw new Error('请先导入录制。');
    const { command, args } = await this.runtime();
    // Validate and build directly from stdin; never evaluate recording content as code.
    const code = 'import sys,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from recording_to_skill import convert,skill_body; data=json.load(sys.stdin); name=sys.argv[3]; workflow=convert(data,name); dest=Path(sys.argv[2])/name; dest.mkdir(parents=True,exist_ok=False); (dest/"references").mkdir(); (dest/"references"/"workflow.json").write_text(json.dumps(workflow,ensure_ascii=False,indent=2)+"\\n",encoding="utf-8"); (dest/"SKILL.md").write_text(skill_body(name),encoding="utf-8"); print(json.dumps({"skillPath":str(dest)},ensure_ascii=True))';
    return JSON.parse(await run(command, [...args, '-c', code, path.join(this.root, 'scripts'), parent, name], JSON.stringify(this.recording)));
  }
}
module.exports = { WorkflowStore };
