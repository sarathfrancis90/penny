const API = process.env.API; const N = Number(process.argv[2] ?? 20);
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
// nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- reviewed: local Firebase Auth emulator on 127.0.0.1, which only serves HTTP
const j = await (await fetch(`${AUTH}/accounts:signUp?key=local`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `stress-${Date.now()}@example.test`, password: 'pw-stress-local', returnSecureToken: true }) })).json();
const body = JSON.stringify({ fileName: 'big.jpg', contentType: 'image/jpeg', base64: Buffer.alloc(5 * 1024 * 1024, 7).toString('base64') });
const t0 = Date.now();
const res = await Promise.all(Array.from({ length: N }, async () => {
  try { const r = await fetch(`${API}/api/media/receipt`, { method: 'POST', headers: { authorization: `Bearer ${j.idToken}`, 'content-type': 'application/json' }, body }); await r.text(); return r.status; } catch (e) { return 'ERR ' + (e.cause?.code ?? e.message); }
}));
const count = {}; for (const s of res) count[s] = (count[s] ?? 0) + 1;
console.log(`${N} concurrent 5 MB uploads in ${Date.now() - t0}ms ->`, JSON.stringify(count));
