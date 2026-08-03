require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// 代理配置：优先读 config.json（前端可改），其次读 .env，最后用代码默认值
const CONFIG_FILE = path.join(__dirname, 'config.json');
const DEFAULT_PROXY = { host: '127.0.0.1', port: '7890' };
let proxyConfig = { enabled: false, host: '', port: '' };

function loadProxyConfig() {
    // 1. 尝试读 config.json
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            if (data && typeof data === 'object') {
                proxyConfig = {
                    enabled: !!data.enabled,
                    host: String(data.host || ''),
                    port: String(data.port || '')
                };
                console.log('已从 config.json 加载代理配置');
                return;
            }
        } catch (e) {
            console.warn('config.json 解析失败，将回退到 .env:', e.message);
        }
    }
    // 2. 回退到 .env
    if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
        proxyConfig = {
            enabled: true,
            host: process.env.PROXY_HOST,
            port: process.env.PROXY_PORT
        };
        console.log('已从 .env 加载代理配置');
        return;
    }
    // 3. 用代码默认值（不启用，仅预填到 UI）
    proxyConfig = {
        enabled: false,
        host: DEFAULT_PROXY.host,
        port: DEFAULT_PROXY.port
    };
    console.log(`未找到代理配置，使用默认值 ${DEFAULT_PROXY.host}:${DEFAULT_PROXY.port}（未启用）`);
}

function buildAgent() {
    if (!proxyConfig.enabled || !proxyConfig.host || !proxyConfig.port) return null;
    return new HttpsProxyAgent(`http://${proxyConfig.host}:${proxyConfig.port}`);
}

let fetchAgent = null;

function applyProxy() {
    fetchAgent = buildAgent();
    if (fetchAgent) {
        console.log(`Bangumi 代理已启用: http://${proxyConfig.host}:${proxyConfig.port}`);
    } else {
        console.log('Bangumi 代理未配置，将直连 api.bgm.tv');
    }
}

loadProxyConfig();
applyProxy();

function saveProxyConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(proxyConfig, null, 2), 'utf-8');
}

// 启用 CORS 和 JSON 解析
app.use(cors());
app.use(express.json());

// 读取代理配置
app.get('/api/proxy/config', (req, res) => {
    res.json({
        enabled: proxyConfig.enabled,
        host: proxyConfig.host,
        port: proxyConfig.port
    });
});

// 保存代理配置
app.post('/api/proxy/config', (req, res) => {
    try {
        const { enabled, host, port } = req.body || {};
        proxyConfig = {
            enabled: !!enabled,
            host: typeof host === 'string' ? host.trim() : '',
            port: typeof port === 'string' ? port.trim() : (port ? String(port) : '')
        };
        // host/port 必填校验
        if (proxyConfig.enabled && (!proxyConfig.host || !proxyConfig.port)) {
            return res.status(400).json({ error: '启用代理时 host 和 port 必填' });
        }
        saveProxyConfig();
        applyProxy();
        res.json({ ok: true, config: proxyConfig });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 测试代理连接（直连/通过代理各试一次）
app.post('/api/proxy/test', async (req, res) => {
    const results = { direct: null, proxy: null };
    const testUrl = 'https://api.bgm.tv/v0/search/subjects';

    async function tryFetch(agent, label) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            const r = await fetch(testUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'GameTracker/1.0' },
                body: JSON.stringify({ keyword: 'a', limit: 1 }),
                agent: agent || undefined,
                signal: controller.signal
            });
            clearTimeout(timer);
            return { label, ok: r.ok, status: r.status };
        } catch (e) {
            return { label, ok: false, error: e.message };
        }
    }

    results.direct = await tryFetch(null, '直连');
    if (fetchAgent) {
        results.proxy = await tryFetch(fetchAgent, '代理');
    }
    res.json(results);
});

// Bangumi API 代理端点
app.post('/api/search', async (req, res) => {
    try {
        const { keyword, sort, filter } = req.body;
        
        console.log('收到搜索请求:', keyword);
        
        const response = await fetch('https://api.bgm.tv/v0/search/subjects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'GameTracker/1.0',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                keyword: keyword,
                sort: sort || 'rank',
                filter: filter || { type: [4] },
                limit: 40
            }),
            agent: fetchAgent || undefined
        });

        if (!response.ok) {
            throw new Error(`Bangumi API 请求失败: ${response.status}`);
        }

        const data = await response.json();
        console.log('API 返回数据:', data);
        
        res.json(data);
    } catch (error) {
        console.error('代理请求错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 静态文件服务（可选，方便直接访问）
app.use(express.static('.'));

app.listen(PORT, () => {
    console.log(`游戏追踪器代理服务器运行在 http://localhost:${PORT}`);
    console.log(`搜索 API 端点: http://localhost:${PORT}/api/search`);
});
