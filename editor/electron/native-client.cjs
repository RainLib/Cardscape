const {spawn} = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');

class NativeWorker {
  constructor(binary = path.join(__dirname, '../native/target/release/card-worker'), options = {}) {
    this.binary = binary; this.args=options.args||[];this.label=options.label||'Rust';this.pending = new Map(); this.nextId = 1; this.child = null;
  }
  start() {
    if (this.child) return;
    const child = spawn(this.binary, this.args, {stdio:['pipe','pipe','pipe']});
    this.child = child;
    const lines = readline.createInterface({input:child.stdout});
    lines.on('line', line => {
      try {
        const response = JSON.parse(line), entry = this.pending.get(response.id);
        if (!entry || entry.child !== child) return;
        this.pending.delete(response.id); clearTimeout(entry.timer);
        response.ok ? entry.resolve({...response.result, elapsedMs:response.elapsed_ms}) : entry.reject(Error(response.error));
      } catch (error) { this.fail(child, Error(`Invalid native response: ${error.message}`)); }
    });
    // A canceled worker can close its pipe while a large PNG request is still
    // buffered. The write callback alone does not consume the stream error.
    child.stdin.on('error', error => this.fail(child, error));
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('error', error => this.fail(child, error));
    child.on('exit', () => this.fail(child, Error(this.label+' worker exited')));
  }
  fail(child, error) {
    if (this.child === child) this.child = null;
    for (const [id, entry] of this.pending) if (entry.child === child) {
      clearTimeout(entry.timer); entry.reject(error); this.pending.delete(id);
    }
  }
  call(op, args = {}) {
    this.start(); const child = this.child, id = this.nextId++;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.cancel(); }, 120_000);
      this.pending.set(id,{resolve,reject,timer,child});
      child.stdin.write(JSON.stringify({id,op,args})+'\n', error => {
        if (error) this.fail(child,error);
      });
    });
  }
  cancel() {
    const child = this.child;
    if (!child) return;
    this.fail(child, Error('处理已取消')); child.kill();
  }
  close() { this.cancel(); }
}
module.exports = {NativeWorker};
