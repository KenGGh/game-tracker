// 扫描常见本地代理端口，找出 FastLink 实际监听的端口
const net = require('net');

const ports = [7890, 7891, 1080, 10809, 10808, 8889, 9797, 1087, 2080, 2086, 2087];
let pending = ports.length;
let found = [];

ports.forEach((p) => {
    const s = new net.Socket();
    s.setTimeout(800);
    s.on('connect', () => {
        found.push(p);
        console.log(`[OK ] 127.0.0.1:${p}  端口开放`);
        s.destroy();
        if (--pending === 0) done();
    });
    s.on('timeout', () => { s.destroy(); if (--pending === 0) done(); });
    s.on('error', () => { if (--pending === 0) done(); });
    s.connect(p, '127.0.0.1');
});

function done() {
    if (found.length === 0) {
        console.log('\n没找到任何可用端口。FastLink 客户端可能：');
        console.log('  1. 没在运行');
        console.log('  2. 没开启"允许局域网连接"或"本地代理"');
        console.log('  3. 用了上面没列出的端口 — 请打开客户端设置确认');
    } else {
        console.log(`\n建议把 .env 的 PROXY_PORT 改成上面任一 [OK] 端口（推荐 7890/7891/10809）。`);
    }
}
