class GameTracker {
    constructor() {
        this.games = [];
        this.platforms = [];
        this.sortBy = localStorage.getItem('sortBy') || 'completionDate';
        this.sortOrder = localStorage.getItem('sortOrder') || 'desc';
        this.mainTitle = localStorage.getItem('mainTitle') || '坑仔的游戏记录';
        this.subTitle = localStorage.getItem('subTitle') || '-今年肝了多少游戏？-';
        this.dbName = 'gameTrackerDB';
        this.dbVersion = 2; // 增加版本号以触发数据库升级
        this.db = null;
        this.monthlyCharts = {};
        this.chartsCollapsed = JSON.parse(localStorage.getItem('chartsCollapsed') || 'false');
        this.initDB().then(() => {
            this.loadData().then(() => {
                this.init();
            });
        });
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error('数据库打开失败:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 如果存在旧的存储对象，先删除它们
                if (db.objectStoreNames.contains('platforms')) {
                    db.deleteObjectStore('platforms');
                }
                if (db.objectStoreNames.contains('games')) {
                    db.deleteObjectStore('games');
                }
                if (db.objectStoreNames.contains('images')) {
                    db.deleteObjectStore('images');
                }
                
                // 创建游戏数据存储
                const gamesStore = db.createObjectStore('games', { keyPath: 'id' });
                gamesStore.createIndex('addedAt', 'addedAt', { unique: false });
                
                // 创建平台数据存储，添加排序索引
                const platformsStore = db.createObjectStore('platforms', { keyPath: 'id' });
                platformsStore.createIndex('order', 'order', { unique: false });
                
                // 创建图片数据存储
                db.createObjectStore('images', { keyPath: 'id' });
            };
        });
    }

    async loadData() {
        try {
            // 加载游戏数据
            this.games = await this.getAllFromStore('games') || [];
            
            // 加载平台数据
            const platforms = await this.getAllFromStore('platforms');
            if (!platforms || platforms.length === 0) {
                // 如果没有保存的平台数据，使用默认平台
                this.platforms = this.getDefaultPlatforms().map((platform, index) => ({
                    ...platform,
                    order: index
                }));
                await this.savePlatforms();
            } else {
                // 使用保存的平台数据，按order属性排序
                this.platforms = platforms.sort((a, b) => {
                    const orderA = typeof a.order === 'number' ? a.order : 999;
                    const orderB = typeof b.order === 'number' ? b.order : 999;
                    return orderA - orderB;
                });

            }
        } catch (error) {
            console.error('加载数据失败:', error);
            this.showNotification('加载数据失败', 'error');
        }
    }

    async getAllFromStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            // 等待事务完成的Promise
            const transactionComplete = new Promise((transResolve, transReject) => {
                transaction.oncomplete = () => transResolve();
                transaction.onerror = () => transReject(transaction.error);
                transaction.onabort = () => transReject(new Error('Transaction aborted'));
            });

            request.onsuccess = async () => {
                try {
                    await transactionComplete;
                    resolve(request.result);
                } catch (error) {
                    console.error(`从 ${storeName} 加载数据失败:`, error);
                    reject(error);
                }
            };

            request.onerror = () => {
                console.error(`从 ${storeName} 加载数据失败:`, request.error);
                reject(request.error);
            };
        });
    }

    getDefaultPlatforms() {
        return [
            { id: 'steam', name: 'Steam', color: '#033d62' },
            { id: 'ps5', name: 'PS5', color: '#0344b5' },
            { id: 'ps4', name: 'PS4', color: '#0344b5' },
            { id: 'switch2', name: 'Nintendo Switch 2', color: '#e70013' },
            { id: 'switch', name: 'Nintendo Switch', color: '#e70013' },
            { id: 'xbox', name: 'Xbox', color: '#0f7c0f' }


        ];
    }

    init() {
        this.bindEvents();
        this.renderGames();
        this.updatePlatformOptions();
        this.initSortControls();
        this.updateTitles();
        this.initTitleInputs();
        this.updateToggleChartsButton();
    }

    updateTitles() {
        document.querySelector('.header h1').innerHTML = `<i class="fas fa-gamepad"></i> ${this.escapeHtml(this.mainTitle)}`;
        document.querySelector('.header p').textContent = this.subTitle;
    }

    initTitleInputs() {
        const mainTitleInput = document.getElementById('mainTitle');
        const subTitleInput = document.getElementById('subTitle');
        
        mainTitleInput.value = this.mainTitle;
        subTitleInput.value = this.subTitle;
        
        mainTitleInput.addEventListener('change', () => {
            this.mainTitle = mainTitleInput.value.trim() || '游戏记录';
            localStorage.setItem('mainTitle', this.mainTitle);
            this.updateTitles();
        });
        
        subTitleInput.addEventListener('change', () => {
            this.subTitle = subTitleInput.value.trim() || '';
            localStorage.setItem('subTitle', this.subTitle);
            this.updateTitles();
        });
    }

    bindEvents() {
        // 添加游戏表单提交
        document.getElementById('addGameForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addGame();
        });

        // 文件上传事件
        document.getElementById('gameCover').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('removeCover').addEventListener('click', () => this.removeCover());
        
        // 添加评论字符计数功能
        const gameCommentInput = document.getElementById('gameComment');
        gameCommentInput.addEventListener('input', (e) => {
            const length = e.target.value.length;
            const maxLength = 20;
            const remaining = maxLength - length;
            
            // 更新帮助文本
            const helpText = e.target.parentNode.querySelector('.form-help');
            if (helpText) {
                if (remaining >= 0) {
                    helpText.textContent = `可选：不超过20个字的简短评论（还可输入${remaining}个字符）`;
                } else {
                    helpText.textContent = `可选：不超过20个字的简短评论（超出${Math.abs(remaining)}个字符）`;
                }
            }
        });



        // 通关日期输入验证
        document.getElementById('gameCompletionDate').addEventListener('input', (e) => {
            const dateInput = e.target;
            const dateValue = dateInput.value;
            
            if (dateValue) {
                const date = new Date(dateValue);
                const year = date.getFullYear();
                
                // 检查年份是否在合理范围内
                if (year < 1990 || year > 2099) {
                    dateInput.setCustomValidity('请输入1990年到2099年之间的日期');
                    this.showNotification('请输入合理的年份（1990-2099）', 'error');
                } else {
                    dateInput.setCustomValidity('');
                }
            }
        });

        // 模态框事件
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelAdd').addEventListener('click', () => this.closeModal());
        document.getElementById('resetForm').addEventListener('click', () => this.resetForm());

        // 设置模态框事件
        document.getElementById('closeSettingsModal').addEventListener('click', () => this.closeSettingsModal());

        // 点击模态框背景关闭
        document.getElementById('addGameModal').addEventListener('click', (e) => {
            if (e.target.id === 'addGameModal') {
                this.closeModal();
            }
        });

        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                this.closeSettingsModal();
            }
        });
    }

    async openModal(gameId = null) {
        document.getElementById('addGameModal').classList.add('show');
        document.body.style.overflow = 'hidden';
        
        const deleteBtn = document.getElementById('deleteGameBtn');
        
        if (gameId) {
            // 编辑模式
            this.currentEditingGameId = gameId;
            await this.fillFormWithGameData(gameId);
            document.querySelector('.modal-header h2').innerHTML = '<i class="fas fa-edit"></i> 编辑游戏';
            document.querySelector('.form-actions button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> 保存修改';
            deleteBtn.style.display = 'inline-flex';
            
            // 绑定删除事件
            deleteBtn.onclick = () => this.deleteGame(gameId);
        } else {
            // 添加模式
            this.currentEditingGameId = null;
            this.resetForm();
            document.querySelector('.modal-header h2').innerHTML = '<i class="fas fa-plus"></i> 添加新游戏';
            document.querySelector('.form-actions button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> 添加游戏';
            deleteBtn.style.display = 'none';
        }
    }

    async fillFormWithGameData(gameId) {
        const game = this.games.find(g => g.id === gameId);
        if (!game) return;

        document.getElementById('gameName').value = game.name;
        document.getElementById('gameOriginalName').value = game.originalName || '';
        document.getElementById('gamePlatform').value = game.platform || '';
        document.getElementById('gameCompletionDate').value = game.completionDate || '';
        // 设置喜爱度评分
        if (game.rating) {
            document.querySelector(`input[name="rating"][value="${game.rating}"]`).checked = true;
        } else {
            // 清除所有爱心选择
            document.querySelectorAll('input[name="rating"]').forEach(input => input.checked = false);
        }
        document.getElementById('gameComment').value = game.comment || '';

        // 处理封面图片预览
        let coverSrc = null;
        
        if (game.imageId) {
            // 优先使用新的imageId系统
            coverSrc = await this.getImage(game.imageId);
        }
        
        if (!coverSrc && game.cover) {
            // 如果没有通过imageId获取到图片，尝试使用旧的cover字段
            coverSrc = game.cover;
        }
        
        if (coverSrc) {
            document.getElementById('previewImage').src = coverSrc;
            document.getElementById('coverPreview').style.display = 'block';
        } else {
            document.getElementById('coverPreview').style.display = 'none';
        }
    }

    closeModal() {
        document.getElementById('addGameModal').classList.remove('show');
        document.body.style.overflow = 'auto';
        this.resetForm();
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // 检查文件类型
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件！');
            return;
        }

        // 检查文件大小（限制为5MB）
        if (file.size > 5 * 1024 * 1024) {
            alert('图片文件大小不能超过5MB！');
            return;
        }

        try {
            // 压缩图片
            const compressedImage = await this.compressImage(file);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewImage = document.getElementById('previewImage');
                const coverPreview = document.getElementById('coverPreview');
                
                previewImage.src = e.target.result;
                coverPreview.style.display = 'block';
            };
            reader.readAsDataURL(compressedImage);
        } catch (error) {
            console.error('处理图片失败:', error);
            this.showNotification('处理图片失败', 'error');
        }
    }

    async compressImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // 设置最大尺寸
                const MAX_SIZE = 800;
                if (width > height && width > MAX_SIZE) {
                    height = Math.round((height * MAX_SIZE) / width);
                    width = MAX_SIZE;
                } else if (height > MAX_SIZE) {
                    width = Math.round((width * MAX_SIZE) / height);
                    height = MAX_SIZE;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // 转换为Blob
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, file.type, 0.8); // 压缩质量为0.8
            };
            
            img.onerror = () => reject(new Error('图片加载失败'));
            
            const reader = new FileReader();
            reader.onload = (e) => img.src = e.target.result;
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsDataURL(file);
        });
    }

    removeCover() {
        document.getElementById('gameCover').value = '';
        document.getElementById('coverPreview').style.display = 'none';
        document.getElementById('previewImage').src = '';
    }

    addGame() {
        const gameName = document.getElementById('gameName').value.trim();
        const gameOriginalName = document.getElementById('gameOriginalName').value.trim();
        const gamePlatform = document.getElementById('gamePlatform').value;
        const gameCompletionDate = document.getElementById('gameCompletionDate').value;
        const gameRating = document.querySelector('input[name="rating"]:checked')?.value || null;
        const gameComment = document.getElementById('gameComment').value.trim();
        const gameCoverFile = document.getElementById('gameCover').files[0];

        if (!gameName) {
            alert('请填写游戏名称！');
            return;
        }

        // 验证评论长度（不超过20个中文字）
        if (gameComment && gameComment.length > 20) {
            alert('评论不能超过20个字符！');
            return;
        }

        if (this.currentEditingGameId) {
            // 编辑模式
            this.updateGame(gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameRating, gameComment, gameCoverFile);
        } else {
            // 添加模式
            let coverData = null;
            if (gameCoverFile) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    coverData = e.target.result;
                    this.saveGameWithCover(gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameRating, gameComment, coverData);
                };
                reader.readAsDataURL(gameCoverFile);
            } else {
                this.saveGameWithCover(gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameRating, gameComment, null);
            }
        }
    }

    updateGame(gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameRating, gameComment, gameCoverFile) {
        const gameIndex = this.games.findIndex(g => g.id === this.currentEditingGameId);
        if (gameIndex === -1) return;

        const game = this.games[gameIndex];
        
        // 处理封面图片
        let coverData = game.cover; // 保持原有封面
                    if (gameCoverFile) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    coverData = e.target.result;
                    this.saveUpdatedGame(gameIndex, gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameRating, gameComment, coverData);
                };
                reader.readAsDataURL(gameCoverFile);
            } else {
                this.saveUpdatedGame(gameIndex, gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameRating, gameComment, coverData);
            }
    }

    async saveUpdatedGame(gameIndex, gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameRating, gameComment, coverData) {
        try {
            const game = this.games[gameIndex];
            let imageId = game.imageId;

            if (coverData) {
                // 如果有新的封面图片
                if (!imageId) {
                    imageId = `game_${game.id}_cover`;
                }
                await this.saveImage(imageId, coverData);
            }

            this.games[gameIndex] = {
                ...game,
                name: gameName,
                originalName: gameOriginalName,
                platform: gamePlatform,
                completionDate: gameCompletionDate || null,
                rating: gameRating ? parseInt(gameRating) : null,
                comment: gameComment || null,
                imageId: imageId
            };

            await this.saveGames();
            await this.renderGames();
            this.closeModal();
            
            this.showNotification('游戏信息更新成功！', 'success');
        } catch (error) {
            console.error('更新游戏失败:', error);
            this.showNotification('更新游戏失败', 'error');
        }
    }

    async saveGameWithCover(gameName, gameOriginalName, gamePlatform, completionDate, gameRating, gameComment, coverData) {
        const gameId = Date.now();
        let imageId = null;

        try {
            if (coverData) {
                imageId = `game_${gameId}_cover`;
                await this.saveImage(imageId, coverData);
            }

            const game = {
                id: gameId,
                name: gameName,
                originalName: gameOriginalName,
                platform: gamePlatform,
                completionDate: completionDate || null,
                rating: gameRating ? parseInt(gameRating) : null,
                comment: gameComment || null,
                imageId: imageId,
                addedAt: new Date().toISOString()
            };

            this.games.push(game);
            await this.saveGames();
            await this.renderGames();
            this.closeModal();
            
            this.showNotification('游戏添加成功！', 'success');
        } catch (error) {
            console.error('保存游戏失败:', error);
            this.showNotification('保存游戏失败', 'error');
        }
    }

    resetForm() {
        document.getElementById('addGameForm').reset();
        document.getElementById('coverPreview').style.display = 'none';
        document.getElementById('previewImage').src = '';
        
        // 清除喜爱度评分
        document.querySelectorAll('input[name="rating"]').forEach(input => input.checked = false);
        
        // 只在添加模式下设置今天的日期
        if (!this.currentEditingGameId) {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('gameCompletionDate').value = today;
        }
        
        this.showNotification('表单已重置！', 'info');
    }

    deleteGame(gameId) {
        if (confirm('确定要删除这个游戏记录吗？此操作不可撤销。')) {
            this.games = this.games.filter(game => game.id !== gameId);
            this.saveGames();
            this.renderGames();
            this.closeModal();
            this.showNotification('游戏记录已删除！', 'success');
        }
    }

    async saveGames() {
        try {
            const transaction = this.db.transaction('games', 'readwrite');
            const store = transaction.objectStore('games');
            
            // 清空现有数据
            await new Promise((resolve, reject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => resolve();
                clearRequest.onerror = () => reject(clearRequest.error);
            });
            
            // 保存所有游戏数据
            for (const game of this.games) {
                await new Promise((resolve, reject) => {
                    const request = store.put(game);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
        } catch (error) {
            console.error('保存游戏数据失败:', error);
            this.showNotification('保存游戏数据失败', 'error');
        }
    }

    async saveImage(imageId, imageData) {
        try {
            const transaction = this.db.transaction('images', 'readwrite');
            const store = transaction.objectStore('images');
            await new Promise((resolve, reject) => {
                const request = store.put({ id: imageId, data: imageData });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('保存图片失败:', error);
            throw error;
        }
    }

    async getImage(imageId) {
        try {
            const transaction = this.db.transaction('images', 'readonly');
            const store = transaction.objectStore('images');
            return new Promise((resolve, reject) => {
                const request = store.get(imageId);
                request.onsuccess = () => resolve(request.result ? request.result.data : null);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('获取图片失败:', error);
            return null;
        }
    }

    getPlatformClass(platform) {
        if (!platform) return 'other';
        
        const platformLower = platform.toLowerCase();
        const foundPlatform = this.platforms.find(p => 
            p.name.toLowerCase() === platformLower || 
            p.id.toLowerCase() === platformLower
        );
        
        if (foundPlatform) {
            return foundPlatform.id;
        }
        
        // 兼容旧数据
        if (platformLower.includes('pc')) return 'pc';
        if (platformLower.includes('ps5')) return 'ps5';
        if (platformLower.includes('ps4')) return 'ps4';
        if (platformLower.includes('xbox')) return 'xbox';
        if (platformLower.includes('switch')) return 'switch';
        if (platformLower.includes('手机')) return 'mobile';
        return 'other';
    }

    async renderGames() {
        const gamesList = document.getElementById('gamesList');

        if (this.games.length === 0) {
            gamesList.innerHTML = `
                <div class="no-games">
                    <i class="fas fa-gamepad"></i>
                    <h3>还没有游戏记录</h3>
                    <p>点击右上角的"+"按钮开始添加游戏吧！</p>
                </div>
            `;
            return;
        }

        // 按通关日期分组
        const gamesByYear = {};
        const gamesWithoutDate = [];
        
        this.games.forEach(game => {
            if (game.completionDate) {
                const year = new Date(game.completionDate).getFullYear();
                if (!gamesByYear[year]) {
                    gamesByYear[year] = [];
                }
                gamesByYear[year].push(game);
            } else {
                gamesWithoutDate.push(game);
            }
        });

        // 对每个年份的游戏进行排序
        Object.keys(gamesByYear).forEach(year => {
            gamesByYear[year] = this.sortGames(gamesByYear[year]);
        });
        
        // 对未通关游戏进行排序
        if (gamesWithoutDate.length > 0) {
            gamesWithoutDate.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
        }

        // 按年份排序（最新的在前）
        const sortedYears = Object.keys(gamesByYear).sort((a, b) => b - a);
        
        let html = '';
        
        // 渲染有通关日期的游戏（按年份分组）
        for (const year of sortedYears) {
            const yearGames = gamesByYear[year];
            const gameCards = await Promise.all(yearGames.map(game => this.createGameCard(game)));
            
            html += `
                <div class="year-section">
                    <div class="year-title">
                        <i class="fas fa-calendar"></i>
                        <span>${year}年通关游戏</span>
                        <span class="game-count">${yearGames.length}个</span>
                    </div>
                    <div class="year-chart">
                        <canvas id="monthlyChart-${year}" aria-label="${year} 每月通关柱状图" role="img"></canvas>
                    </div>
                    <div class="games-grid">
                        ${gameCards.join('')}
                        <div class="add-game-card" onclick="gameTracker.openModal()" role="button" tabindex="0" aria-label="添加新游戏" title="添加新游戏">
                            <div class="add-game-content">
                                <i class="fas fa-plus" aria-hidden="true"></i>
                                <span>添加游戏</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 渲染没有通关日期的游戏
        if (gamesWithoutDate.length > 0) {
            const gameCards = await Promise.all(gamesWithoutDate.map(game => this.createGameCard(game)));
            
            html += `
                <div class="year-section">
                    <div class="year-title">
                        <i class="fas fa-clock"></i>
                        <span>未通关游戏</span>
                        <span class="game-count">${gamesWithoutDate.length}个</span>
                    </div>
                    <div class="games-grid">
                        ${gameCards.join('')}
                        <div class="add-game-card" onclick="gameTracker.openModal()" role="button" tabindex="0" aria-label="添加新游戏" title="添加新游戏">
                            <div class="add-game-content">
                                <i class="fas fa-plus" aria-hidden="true"></i>
                                <span>添加游戏</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        gamesList.innerHTML = html;

        // 渲染每年每月通关数量柱状图
        try {
            for (const year of sortedYears) {
                const canvas = document.getElementById(`monthlyChart-${year}`);
                const container = canvas ? canvas.parentElement : null;
                if (!canvas || !container) continue;
                if (this.monthlyCharts[year]) {
                    try { this.monthlyCharts[year].destroy(); } catch (e) {}
                    this.monthlyCharts[year] = null;
                }
                if (this.chartsCollapsed) {
                    container.style.display = 'none';
                } else {
                    container.style.display = '';
                    this.monthlyCharts[year] = this.createMonthlyChart(canvas, gamesByYear[year], year);
                }
            }
        } catch (e) {
            console.error('渲染柱状图失败:', e);
        }
    }

    toggleCharts() {
        this.chartsCollapsed = !this.chartsCollapsed;
        localStorage.setItem('chartsCollapsed', JSON.stringify(this.chartsCollapsed));
        this.updateToggleChartsButton();
        // 重新渲染以应用显示/隐藏
        this.renderGames();
    }

    updateToggleChartsButton() {
        const btn = document.getElementById('toggleChartsBtn');
        if (!btn) return;
        if (this.chartsCollapsed) {
            btn.innerHTML = '<i class="fas fa-chart-column" aria-hidden="true"></i> 展开柱状图';
            btn.setAttribute('aria-label', '展开柱状图');
            btn.setAttribute('title', '展开柱状图');
        } else {
            btn.innerHTML = '<i class="fas fa-chart-column" aria-hidden="true"></i> 收起柱状图';
            btn.setAttribute('aria-label', '收起柱状图');
            btn.setAttribute('title', '收起柱状图');
        }
    }

    createMonthlyChart(canvasEl, yearGames, year) {
        const labels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
        const ctx = canvasEl.getContext('2d');
        const gridColor = 'rgba(0,0,0,0.05)';
        const tickColor = '#718096';
        const palette = ['#667eea', '#764ba2', '#34d399', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#10b981', '#f472b6', '#fb923c'];
        const monthCounts = new Array(12).fill(0);

        // 为每个游戏生成一个数据集，在其月份位置为1，实现堆叠
        const datasets = [];
        const games = yearGames.filter(g => g && g.completionDate && g.name);
        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            const month = new Date(game.completionDate).getMonth();
            if (month < 0 || month > 11) continue;
            const data = new Array(12).fill(null);
            data[month] = 1;
            monthCounts[month]++;
            const platformClass = this.getPlatformClass(game.platform);
            const platform = this.platforms.find(p => p.id === platformClass);
            const color = platform && platform.color ? platform.color : palette[i % palette.length];
            datasets.push({
                label: String(game.name),
                data,
                // 由自定义插件绘制填充与描边，这里设为透明避免默认方角绘制
                backgroundColor: 'rgba(0,0,0,0)',
                borderColor: '#ffffff',
                borderWidth: 0,
                stack: 'stack1',
                // 记录实际颜色供插件使用
                cellColor: color,
                maxBarThickness: 200,
                barThickness: 128,
                barPercentage: 1,
                categoryPercentage: 1,
                completionDate: game.completionDate
            });
        }

        // 固定单格高度，动态计算画布高度
        const maxCount = Math.max(0, ...monthCounts);
        const cellHeight =64; // 每个游戏格子的像素高度
        const verticalPadding = 24; // 上下绘图区内边距之和
        const xAxisReserve = 36; // 预留给 X 轴刻度/标签
        const chartHeight = Math.max(120, maxCount * cellHeight + verticalPadding + xAxisReserve);
        // 设置容器与画布高度，保证响应式不覆盖实际显示高度
        const container = canvasEl.parentElement;
        if (container && container.classList && container.classList.contains('year-chart')) {
            container.style.height = chartHeight + 'px';
        }
        canvasEl.style.height = chartHeight + 'px';
        // 同步绘图缓冲区高度以获得清晰渲染
        canvasEl.height = chartHeight;

        const roundedCellPlugin = {
            id: 'roundedCellPlugin',
            beforeDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                chart.data.datasets.forEach((ds, dsi) => {
                    const meta = chart.getDatasetMeta(dsi);
                    const fillColor = ds.cellColor || ds.backgroundColor || '#667eea';
                    const strokeColor = ds.borderColor || '#ffffff';
                    meta.data.forEach((rect, idx) => {
                        const val = ds.data[idx];
                        if (!val) return;
                        const left = rect.x - rect.width / 2;
                        const right = rect.x + rect.width / 2;
                        const top = Math.min(rect.y, rect.base);
                        const bottom = Math.max(rect.y, rect.base);
                        const width = Math.max(0, right - left);
                        const height = Math.max(0, bottom - top);
                        const r = Math.min(12, width / 2, height / 2);
                        // 绘制圆角矩形
                        ctx.beginPath();
                        ctx.moveTo(left + r, top);
                        ctx.lineTo(right - r, top);
                        ctx.quadraticCurveTo(right, top, right, top + r);
                        ctx.lineTo(right, bottom - r);
                        ctx.quadraticCurveTo(right, bottom, right - r, bottom);
                        ctx.lineTo(left + r, bottom);
                        ctx.quadraticCurveTo(left, bottom, left, bottom - r);
                        ctx.lineTo(left, top + r);
                        ctx.quadraticCurveTo(left, top, left + r, top);
                        ctx.closePath();
                        ctx.fillStyle = fillColor;
                        ctx.fill();
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = strokeColor;
                        ctx.stroke();
                    });
                });
                ctx.restore();
            }
        };

        const segmentLabelPlugin = {
            id: 'segmentLabelPlugin',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                const font = '12px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
                const lineHeight = 14; // px
                const padding = 3; // 内边距
                ctx.save();
                ctx.font = font;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(0,0,0,0.35)';
                ctx.shadowBlur = 2;
                ctx.shadowOffsetY = 1;

                const wrapToLines = (text, maxWidth, maxLines) => {
                    const measure = (s) => ctx.measureText(s).width;
                    if (maxWidth <= 2) return [];
                    const lines = [];
                    let current = '';
                    for (const ch of String(text)) {
                        const next = current + ch;
                        if (measure(next) <= maxWidth) {
                            current = next;
                        } else {
                            if (current.length > 0) lines.push(current);
                            current = ch;
                            if (lines.length >= maxLines) break;
                        }
                    }
                    if (lines.length < maxLines && current.length > 0) lines.push(current);
                    // 截断超出行数
                    if (lines.length > maxLines) lines.length = maxLines;
                    // 若仍有剩余需要标记省略号
                    const originalWidth = measure(text);
                    const displayedWidth = lines.reduce((w, line) => w + measure(line), 0);
                    if (lines.length > 0 && (lines.length === maxLines || displayedWidth < originalWidth)) {
                        const ellipsis = '…';
                        let last = lines[lines.length - 1];
                        while (last.length > 0 && measure(last + ellipsis) > maxWidth) {
                            last = last.slice(0, -1);
                        }
                        if (last.length === 0 && measure(ellipsis) <= maxWidth) {
                            lines[lines.length - 1] = ellipsis;
                        } else if (last.length > 0) {
                            lines[lines.length - 1] = last + ellipsis;
                        }
                    }
                    return lines;
                };

                chart.data.datasets.forEach((ds, dsi) => {
                    const meta = chart.getDatasetMeta(dsi);
                    meta.data.forEach((rect, idx) => {
                        const val = ds.data[idx];
                        if (!val) return;
                        const left = rect.x - rect.width / 2;
                        const right = rect.x + rect.width / 2;
                        const top = Math.min(rect.y, rect.base);
                        const bottom = Math.max(rect.y, rect.base);
                        const maxTextWidth = Math.max(0, rect.width - padding * 2);
                        const availableHeight = Math.max(0, (bottom - top) - padding * 2);
                        const maxLines = Math.floor(availableHeight / lineHeight);
                        if (maxLines <= 0 || maxTextWidth <= 2) return;

                        const lines = wrapToLines(String(ds.label || ''), maxTextWidth, Math.max(1, maxLines));
                        if (lines.length === 0) return;

                        const totalHeight = (lines.length - 1) * lineHeight;
                        const centerY = (top + bottom) / 2;
                        const startY = centerY - totalHeight / 2;
                        const centerX = (left + right) / 2;
                        for (let i = 0; i < lines.length; i++) {
                            ctx.fillText(lines[i], centerX, startY + i * lineHeight);
                        }
                    });
                });
                ctx.restore();
            }
        };

        return new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 8, right: 8, left: 8, bottom: 0 } },
                interaction: { mode: 'nearest', intersect: true },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: tickColor }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        suggestedMin: 0,
                        suggestedMax: Math.max(1, maxCount),
                        grace: 0,
                        grid: { color: gridColor },
                        ticks: { precision: 0, stepSize: 1, color: tickColor }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: true,
                        callbacks: {
                            title: (items) => {
                                const ds = items && items[0] ? items[0].dataset : null;
                                const d = ds && ds.completionDate ? new Date(ds.completionDate) : null;
                                if (!d) return items && items[0] ? items[0].label : '';
                                return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
                            },
                            label: (ctx) => String(ctx.dataset?.label || ''),
                            labelColor: (ctx) => ({
                                borderColor: '#ffffff',
                                backgroundColor: ctx.dataset && ctx.dataset.cellColor ? ctx.dataset.cellColor : '#667eea'
                            })
                        }
                    }
                }
            },
            plugins: [roundedCellPlugin, segmentLabelPlugin]
        });
    }

    async createGameCard(game) {
        let coverImage = '';
        
        // 优先使用新的imageId系统
        if (game.imageId) {
            const imageData = await this.getImage(game.imageId);
            if (imageData) {
                coverImage = `<img src="${imageData}" alt="${this.escapeHtml(game.name)}" class="game-cover">`;
            } else {
                // 如果imageId存在但获取不到图片，尝试使用旧的cover字段
                if (game.cover) {
                    coverImage = `<img src="${this.escapeHtml(game.cover)}" alt="${this.escapeHtml(game.name)}" class="game-cover">`;
                } else {
                    coverImage = `<div class="game-cover-placeholder">
                        <i class="fas fa-gamepad"></i>
                    </div>`;
                }
            }
        } else if (game.cover) {
            // 如果没有imageId但有旧的cover字段，直接使用
            coverImage = `<img src="${this.escapeHtml(game.cover)}" alt="${this.escapeHtml(game.name)}" class="game-cover">`;
        } else {
            // 没有任何封面数据
            coverImage = `<div class="game-cover-placeholder">
                <i class="fas fa-gamepad"></i>
            </div>`;
        }

        const platformClass = this.getPlatformClass(game.platform);
        const platform = this.platforms.find(p => p.id === platformClass);
        const platformBadge = game.platform ? 
            `<div class="game-platform-badge" style="background: ${platform ? platform.color : '#718096'}">${this.escapeHtml(game.platform)}</div>` : '';

        return `
            <div class="game-card" data-game-id="${game.id}" onclick="gameTracker.handleCardClick(event, ${game.id})">
                <div class="game-card-header">
                    ${coverImage}
                    ${platformBadge}
                </div>
                
                <div class="game-card-content">
                    <div class="game-title">${this.escapeHtml(game.name)}</div>
                    ${game.originalName ? `<div class="game-original-name">${this.escapeHtml(game.originalName)}</div>` : ''}
                    
                    <div class="game-meta">
                        ${game.completionDate ? `
                            <div class="game-completion-date">
                                <i class="fas fa-calendar-check"></i>
                                <span>通关日期：${new Date(game.completionDate).toLocaleDateString('zh-CN')}</span>
                            </div>
                        ` : ''}
                        ${game.rating ? `
                            <div class="game-rating">
                                <i class="fas fa-heart"></i>
                                <span>喜爱度: ${'❤️'.repeat(game.rating)}${'🤍'.repeat(10-game.rating)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${game.comment ? `<div class="game-comment">${this.escapeHtml(game.comment)}</div>` : ''}
                </div>
            </div>
        `;
    }

    handleCardClick(event, gameId) {
        // 打开编辑模态框
        this.openModal(gameId);
    }

    showNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            ${type === 'success' ? 'background: #48bb78;' : type === 'info' ? 'background: #4299e1;' : 'background: #e53e3e;'}
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // 显示通知
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // 自动隐藏
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }



    openSettingsModal() {
        document.getElementById('settingsModal').classList.add('show');
        document.body.style.overflow = 'hidden';
        this.renderPlatformList();
    }

    closeSettingsModal() {
        document.getElementById('settingsModal').classList.remove('show');
        document.body.style.overflow = 'auto';
    }

    renderPlatformList() {
        const platformList = document.getElementById('platformList');
        platformList.innerHTML = this.platforms.map(platform => this.createPlatformItem(platform)).join('');
        this.initDragAndDrop();
    }

    initDragAndDrop() {
        const platformList = document.getElementById('platformList');
        let draggedItem = null;
        
        // 为每个平台项添加拖放事件
        const addDragEvents = (item) => {
            item.setAttribute('draggable', 'true');
            
            item.addEventListener('dragstart', () => {
                draggedItem = item;
                setTimeout(() => item.classList.add('dragging'), 0);
            });
            
            item.addEventListener('dragend', () => {
                draggedItem = null;
                item.classList.remove('dragging');
            });
            
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!draggedItem || item === draggedItem) return;
                
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                
                if (e.clientY < midY) {
                    if (item.previousElementSibling !== draggedItem) {
                        platformList.insertBefore(draggedItem, item);
                    }
                } else {
                    if (item.nextElementSibling !== draggedItem) {
                        platformList.insertBefore(draggedItem, item.nextElementSibling);
                    }
                }
            });
        };
        
        // 初始化现有平台项的拖放事件
        platformList.querySelectorAll('.platform-item').forEach(addDragEvents);
        
        // 监听平台列表的拖放事件
        platformList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.dragging');
            if (!draggingItem) return;
            
            // 如果拖到了列表的末尾
            const afterElement = this.getDragAfterElement(platformList, e.clientY);
            if (!afterElement) {
                platformList.appendChild(draggingItem);
            }
        });
        
        platformList.addEventListener('drop', async (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.dragging');
            if (!draggingItem) return;
            
            try {
                await this.updatePlatformOrder();

            } catch (error) {
                console.error('更新平台顺序失败:', error);
                this.showNotification('更新平台顺序失败', 'error');
            }
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.platform-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async updatePlatformOrder() {
        try {
            const platformItems = document.querySelectorAll('.platform-item');
            const newOrder = [];
            const seenIds = new Set(); // 用于检查重复ID
            let order = 0; // 用于记录顺序
            
            platformItems.forEach(item => {
                const platformId = item.dataset.platformId;
                if (!platformId) {
                    console.warn('找到没有ID的平台项');
                    return;
                }
                
                if (seenIds.has(platformId)) {
                    console.warn(`发现重复的平台ID: ${platformId}`);
                    return;
                }
                
                const platform = this.platforms.find(p => p.id === platformId);
                if (platform) {
                    // 创建平台对象的副本，并添加order属性
                    newOrder.push({
                        ...platform,
                        order: order++
                    });
                    seenIds.add(platformId);
                } else {
                    console.warn(`找不到ID为 ${platformId} 的平台`);
                }
            });
            
            // 确保所有平台都被包含
            if (newOrder.length !== this.platforms.length) {
                console.warn(`平台数量不匹配: 新=${newOrder.length}, 原=${this.platforms.length}`);
                throw new Error('平台数量不匹配');
            }
            

            
            this.platforms = newOrder;
            await this.savePlatforms();
            this.updatePlatformOptions();
            await this.renderGames();
            
            this.showNotification('平台顺序已更新！', 'success');
        } catch (error) {
            console.error('更新平台顺序失败:', error);
            this.showNotification('更新平台顺序失败', 'error');
            
            // 重新加载数据以恢复状态
            await this.loadData();
            this.renderPlatformList();
            this.updatePlatformOptions();
            await this.renderGames();
        }
    }

    createPlatformItem(platform) {
        return `
            <div class="platform-item" data-platform-id="${platform.id}">
                <div class="platform-icon" style="background: ${platform.color}">
                    <i class="fas fa-gamepad"></i>
                </div>
                <div class="platform-info">
                    <div class="platform-name">${this.escapeHtml(platform.name)}</div>
                    <div class="platform-color">${platform.color}</div>
                </div>
                <div class="platform-actions">
                    <button class="btn btn-secondary btn-sm" onclick="gameTracker.editPlatform('${platform.id}')" aria-label="编辑平台" title="编辑平台">
                        <i class="fas fa-edit" aria-hidden="true"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="gameTracker.deletePlatform('${platform.id}')" aria-label="删除平台" title="删除平台">
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        `;
    }

    editPlatform(platformId) {
        const platform = this.platforms.find(p => p.id === platformId);
        if (!platform) return;

        const platformItem = document.querySelector(`[data-platform-id="${platformId}"]`);
        platformItem.classList.add('editing');
        platformItem.setAttribute('draggable', 'false');
        
        platformItem.innerHTML = `
            <div class="platform-icon" style="background: ${platform.color}">
                <i class="fas fa-gamepad"></i>
            </div>
            <form class="platform-form" onsubmit="gameTracker.savePlatform('${platformId}', event)">
                <div class="form-group">
                    <label>平台名称</label>
                    <input type="text" value="${this.escapeHtml(platform.name)}" required>
                </div>
                <div class="form-group">
                    <label>颜色</label>
                    <input type="color" value="${platform.color}" onchange="this.nextElementSibling.style.background = this.value">
                    <div class="color-preview" style="background: ${platform.color}"></div>
                </div>
                <div class="platform-actions">
                    <button type="submit" class="btn btn-primary btn-sm" aria-label="保存平台" title="保存平台">
                        <i class="fas fa-save" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="gameTracker.cancelEditPlatform('${platformId}')" aria-label="取消编辑" title="取消编辑">
                        <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                </div>
            </form>
        `;
    }

    savePlatform(platformId, event) {
        event.preventDefault();
        const form = event.target;
        const name = form.querySelector('input[type="text"]').value.trim();
        const color = form.querySelector('input[type="color"]').value;

        if (!name) {
            alert('请输入平台名称！');
            return;
        }

        const platformIndex = this.platforms.findIndex(p => p.id === platformId);
        if (platformIndex === -1) return;

        this.platforms[platformIndex] = {
            ...this.platforms[platformIndex],
            name: name,
            color: color
        };

        this.savePlatforms();
        this.renderPlatformList();
        this.updatePlatformOptions();
        this.renderGames();
        this.showNotification('平台设置已保存！', 'success');
    }

    cancelEditPlatform(platformId) {
        this.renderPlatformList();
    }

    deletePlatform(platformId) {
        if (this.platforms.length <= 1) {
            alert('至少需要保留一个平台！');
            return;
        }

        if (confirm('确定要删除这个平台吗？相关的游戏记录将保留。')) {
            this.platforms = this.platforms.filter(p => p.id !== platformId);
            this.savePlatforms();
            this.renderPlatformList();
            this.updatePlatformOptions();
            this.renderGames();
            this.showNotification('平台已删除！', 'success');
        }
    }

    addNewPlatform() {
        const newId = 'platform_' + Date.now();
        const newPlatform = {
            id: newId,
            name: '新平台',
            color: '#667eea',

        };

        this.platforms.push(newPlatform);
        this.savePlatforms();
        this.renderPlatformList();
        this.updatePlatformOptions();
        this.editPlatform(newId);
    }

    async savePlatforms() {
        try {

            
            // 创建新的事务
            const transaction = this.db.transaction(['platforms'], 'readwrite');
            const store = transaction.objectStore('platforms');
            
            // 清空现有数据
            const clearRequest = store.clear();
            await new Promise((resolve, reject) => {
                clearRequest.onsuccess = () => {
                    resolve();
                };
                clearRequest.onerror = () => {
                    console.error('清空平台数据失败:', clearRequest.error);
                    reject(clearRequest.error);
                };
            });
            
            // 保存所有平台数据
            for (let i = 0; i < this.platforms.length; i++) {
                const platform = this.platforms[i];
                const platformToSave = {
                    ...platform,
                    order: i // 确保order属性正确
                };
                
                const putRequest = store.put(platformToSave);
                await new Promise((resolve, reject) => {
                    putRequest.onsuccess = () => {
                        resolve();
                    };
                    putRequest.onerror = () => {
                        console.error(`保存平台 ${platform.name} 失败:`, putRequest.error);
                        reject(putRequest.error);
                    };
                });
            }
            
            // 等待事务完成
            await new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    resolve();
                };
                transaction.onerror = () => {
                    console.error('平台数据保存事务失败:', transaction.error);
                    reject(transaction.error);
                };
                transaction.onabort = () => {
                    console.error('平台数据保存事务被中止');
                    reject(new Error('Transaction aborted'));
                };
            });
            

            
        } catch (error) {
            console.error('保存平台数据失败:', error);
            this.showNotification('保存平台数据失败', 'error');
            throw error;
        }
    }

    updatePlatformOptions() {
        const platformSelect = document.getElementById('gamePlatform');
        const currentValue = platformSelect.value;
        
        platformSelect.innerHTML = '<option value="">选择平台</option>' + 
            this.platforms.map(platform => 
                `<option value="${this.escapeHtml(platform.name)}" ${platform.name === currentValue ? 'selected' : ''}>${this.escapeHtml(platform.name)}</option>`
            ).join('');
    }

    initSortControls() {
        document.getElementById('sortBy').value = this.sortBy;
        document.getElementById('sortOrder').value = this.sortOrder;
    }

    updateSort() {
        this.sortBy = document.getElementById('sortBy').value;
        this.sortOrder = document.getElementById('sortOrder').value;
        
        // 保存排序设置到localStorage
        localStorage.setItem('sortBy', this.sortBy);
        localStorage.setItem('sortOrder', this.sortOrder);
        
        this.renderGames();
        this.showNotification('排序已更新！', 'info');
    }

    sortGames(games) {
        return games.sort((a, b) => {
            let aValue, bValue;
            
                                switch (this.sortBy) {
                        case 'completionDate':
                            aValue = a.completionDate ? new Date(a.completionDate).getTime() : 0;
                            bValue = b.completionDate ? new Date(b.completionDate).getTime() : 0;
                            break;
                        case 'platform':
                            aValue = (a.platform || '').toLowerCase();
                            bValue = (b.platform || '').toLowerCase();
                            break;
                        case 'name':
                            aValue = (a.name || '').toLowerCase();
                            bValue = (b.name || '').toLowerCase();
                            break;
                        case 'rating':
                            aValue = a.rating ? parseInt(a.rating) : 0;
                            bValue = b.rating ? parseInt(b.rating) : 0;
                            break;
                        default:
                            return 0;
                    }
            
            if (this.sortOrder === 'asc') {
                return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
            } else {
                return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
            }
        });
    }

    async exportData() {
        try {
            // 准备游戏数据，包含图片数据
            const gamesWithImages = [];
            for (const game of this.games) {
                const gameData = { ...game };
                
                // 如果有imageId，获取对应的图片数据
                if (game.imageId) {
                    try {
                        const imageData = await this.getImage(game.imageId);
                        if (imageData) {
                            gameData.cover = imageData; // 添加cover字段包含图片数据
                        }
                    } catch (error) {
                        console.error(`获取游戏 ${game.name} 的图片失败:`, error);
                    }
                }
                
                gamesWithImages.push(gameData);
            }
            
            const data = {
                games: gamesWithImages,
                platforms: this.platforms,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder,
                exportDate: new Date().toISOString()
            };
            
            const dataStr = JSON.stringify(data, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `game-tracker-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            this.showNotification('数据导出成功！', 'success');
        } catch (error) {
            console.error('导出数据失败:', error);
            this.showNotification('导出数据失败', 'error');
        }
    }

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // 处理游戏数据，转换旧格式的封面
                    if (data.games && Array.isArray(data.games)) {

                        const processedGames = [];
                        
                        for (const game of data.games) {
                            const processedGame = { ...game };
                            
                            // 如果游戏有cover字段（来自新的导出格式或旧格式），转换为新格式
                            if (game.cover && !game.imageId) {
                                try {
                                    const imageId = `game_${game.id}_cover`;
                                    await this.saveImage(imageId, game.cover);
                                    processedGame.imageId = imageId;
                                    delete processedGame.cover; // 删除cover字段，使用imageId

                                } catch (error) {
                                    console.error(`转换游戏 ${game.name} 的封面失败:`, error);
                                    // 如果转换失败，保留原有的cover字段作为备用
                                }
                            }
                            
                            processedGames.push(processedGame);
                        }
                        
                        this.games = processedGames;
                        await this.saveGames();

                    }
                    
                    // 处理平台数据
                    if (data.platforms && Array.isArray(data.platforms)) {
                        // 为旧平台数据添加order属性，并删除icon字段
                        this.platforms = data.platforms.map((platform, index) => {
                            const { icon, ...platformWithoutIcon } = platform;
                            return {
                                ...platformWithoutIcon,
                                order: platform.order !== undefined ? platform.order : index
                            };
                        });
                        await this.savePlatforms();

                    }
                    
                    if (data.sortBy) {
                        this.sortBy = data.sortBy;
                        localStorage.setItem('sortBy', this.sortBy);
                    }
                    
                    if (data.sortOrder) {
                        this.sortOrder = data.sortOrder;
                        localStorage.setItem('sortOrder', this.sortOrder);
                    }
                    
                    this.updatePlatformOptions();
                    await this.renderGames();
                    this.initSortControls();
                    
                                this.showNotification('数据导入成功！', 'success');
        } catch (error) {
            console.error('导入数据失败:', error);
            this.showNotification('导入失败：文件格式不正确', 'error');
        }
    };
    reader.readAsText(file);
};
input.click();
}

    async clearAllData() {
        if (!confirm('确定要清理所有数据吗？\n\n这将删除：\n• 所有游戏记录\n• 所有平台设置\n• 所有图片数据\n\n此操作不可撤销！')) {
            return;
        }
        
        try {
            // 清空游戏数据
            this.games = [];
            await this.saveGames();
            
            // 清空平台数据，恢复默认平台
            this.platforms = this.getDefaultPlatforms();
            await this.savePlatforms();
            
            // 清空图片数据
            const transaction = this.db.transaction('images', 'readwrite');
            const store = transaction.objectStore('images');
            await new Promise((resolve, reject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => resolve();
                clearRequest.onerror = () => reject(clearRequest.error);
            });
            
            // 重置排序设置
            this.sortBy = 'addedAt';
            this.sortOrder = 'desc';
            localStorage.setItem('sortBy', this.sortBy);
            localStorage.setItem('sortOrder', this.sortOrder);
            
            // 重置标题设置
            this.mainTitle = '今年又肝了多少游戏';
            this.subTitle = '年度通关游戏记录';
            localStorage.setItem('mainTitle', this.mainTitle);
            localStorage.setItem('subTitle', this.subTitle);
            
            // 更新界面
            this.updatePlatformOptions();
            await this.renderGames();
            this.updateTitles();
            this.initSortControls();
            this.closeSettingsModal();
            
            this.showNotification('所有数据已清理完成！', 'success');
        } catch (error) {
            console.error('清理数据失败:', error);
            this.showNotification('清理数据失败', 'error');
        }
    }
}

// 初始化应用
const gameTracker = new GameTracker(); 