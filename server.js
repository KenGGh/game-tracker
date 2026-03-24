const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// 启用 CORS 和 JSON 解析
app.use(cors());
app.use(express.json());

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
            })
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
