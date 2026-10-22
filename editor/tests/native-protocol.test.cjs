const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { NativeWorker } = require('../dist/electron/native-client.cjs');

const fixture = String.raw`
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line),{id,args}=request;
 if(args.mode==='invalid-json'){process.stdout.write('invalid-json\n');return;}
 if(args.mode==='invalid-result'){process.stdout.write(JSON.stringify({id,ok:true,result:null,elapsed_ms:1})+'\n');return;}
 if(args.mode==='invalid-error'){process.stdout.write(JSON.stringify({id,ok:false,error:123})+'\n');return;}
 if(args.mode==='error'){process.stdout.write(JSON.stringify({id,ok:false,error:'operation rejected'})+'\n');return;}
 process.stdout.write(JSON.stringify({id:id+1000,ok:true,result:{stale:true},elapsed_ms:2})+'\n');
 process.stdout.write(JSON.stringify({id,ok:true,result:{value:args.value},elapsed_ms:2})+'\n');
});`;

test('worker responses correlate requests and operation errors preserve the worker', async (t) => {
  const worker = new NativeWorker(process.execPath, { args: ['-e', fixture] });
  t.after(() => worker.close());
  assert.deepEqual(await worker.call('fixture', { value: 7 }), {
    value: 7,
    elapsedMs: 2,
  });
  const child = worker.start();
  await assert.rejects(
    worker.call('fixture', { mode: 'error' }),
    /operation rejected/,
  );
  assert.equal(worker.start(), child);
  assert.deepEqual(await worker.call('fixture', { value: 9 }), {
    value: 9,
    elapsedMs: 2,
  });
});

for (const mode of ['invalid-json', 'invalid-result', 'invalid-error']) {
  test(`worker closes malformed protocol process and allows a fresh request: ${mode}`, async (t) => {
    const worker = new NativeWorker(process.execPath, {
      args: ['-e', fixture],
    });
    t.after(() => worker.close());
    const child = worker.start();
    t.after(() => child.kill());
    const closed = once(child, 'close', { signal: AbortSignal.timeout(5000) });
    await assert.rejects(
      worker.call('fixture', { mode }),
      /Invalid native response/,
    );
    assert.equal(child.killed, true);
    // Start a new process before the old exit event: it must not clear new calls.
    const next = worker.call('fixture', { value: 11 });
    await closed;
    assert.deepEqual(await next, { value: 11, elapsedMs: 2 });
  });
}
