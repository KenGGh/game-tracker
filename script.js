class GameTracker {
    constructor() {
        this.games = JSON.parse(localStorage.getItem('games')) || [];
        this.platforms = JSON.parse(localStorage.getItem('platforms')) || this.getDefaultPlatforms();
        this.sortBy = localStorage.getItem('sortBy') || 'completionDate';
        this.sortOrder = localStorage.getItem('sortOrder') || 'desc';
        this.init();
    }

    getDefaultPlatforms() {
        return [
            { id: 'pc', name: 'PC', color: '#667eea', icon: 'fas fa-desktop' },
            { id: 'ps5', name: 'PS5', color: '#667eea', icon: 'fas fa-gamepad' },
            { id: 'ps4', name: 'PS4', color: '#667eea', icon: 'fas fa-gamepad' },
            { id: 'xbox', name: 'Xbox Series X', color: '#107c10', icon: 'fas fa-gamepad' },
            { id: 'switch', name: 'Nintendo Switch', color: '#e60012', icon: 'fas fa-gamepad' },
            { id: 'mobile', name: '手机', color: '#ff6b6b', icon: 'fas fa-mobile-alt' },
            { id: 'other', name: '其他', color: '#718096', icon: 'fas fa-question' }
        ];
    }

    init() {
        this.bindEvents();
        this.renderGames();
        this.updatePlatformOptions();
        this.initSortControls();
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

        // Metacritic评分获取事件
        document.getElementById('fetchMetacriticBtn').addEventListener('click', () => this.fetchMetacriticScore());

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

    openModal(gameId = null) {
        document.getElementById('addGameModal').classList.add('show');
        document.body.style.overflow = 'hidden';
        
        const deleteBtn = document.getElementById('deleteGameBtn');
        
        if (gameId) {
            // 编辑模式
            this.currentEditingGameId = gameId;
            this.fillFormWithGameData(gameId);
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

    fillFormWithGameData(gameId) {
        const game = this.games.find(g => g.id === gameId);
        if (!game) return;

        document.getElementById('gameName').value = game.name;
        document.getElementById('gameOriginalName').value = game.originalName || '';
        document.getElementById('gamePlatform').value = game.platform || '';
        document.getElementById('gameCompletionDate').value = game.completionDate || '';
        document.getElementById('gameMetacriticScore').value = game.metacriticScore || '';

        // 处理封面图片预览
        if (game.cover) {
            document.getElementById('previewImage').src = game.cover;
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

    handleFileUpload(event) {
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

        const reader = new FileReader();
        reader.onload = (e) => {
            const previewImage = document.getElementById('previewImage');
            const coverPreview = document.getElementById('coverPreview');
            
            previewImage.src = e.target.result;
            coverPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
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
        const gameMetacriticScore = document.getElementById('gameMetacriticScore').value;
        const gameCoverFile = document.getElementById('gameCover').files[0];

        if (!gameName) {
            alert('请填写游戏名称！');
            return;
        }

        if (this.currentEditingGameId) {
            // 编辑模式
            this.updateGame(gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameMetacriticScore, gameCoverFile);
        } else {
            // 添加模式
            let coverData = null;
            if (gameCoverFile) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    coverData = e.target.result;
                    this.saveGameWithCover(gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameMetacriticScore, coverData);
                };
                reader.readAsDataURL(gameCoverFile);
            } else {
                this.saveGameWithCover(gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameMetacriticScore, null);
            }
        }
    }

    updateGame(gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameMetacriticScore, gameCoverFile) {
        const gameIndex = this.games.findIndex(g => g.id === this.currentEditingGameId);
        if (gameIndex === -1) return;

        const game = this.games[gameIndex];
        
        // 处理封面图片
        let coverData = game.cover; // 保持原有封面
        if (gameCoverFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                coverData = e.target.result;
                this.saveUpdatedGame(gameIndex, gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameMetacriticScore, coverData);
            };
            reader.readAsDataURL(gameCoverFile);
        } else {
            this.saveUpdatedGame(gameIndex, gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameMetacriticScore, coverData);
        }
    }

    saveUpdatedGame(gameIndex, gameName, gameOriginalName, gamePlatform, gameCompletionDate, gameMetacriticScore, coverData) {
        this.games[gameIndex] = {
            ...this.games[gameIndex],
            name: gameName,
            originalName: gameOriginalName,
            platform: gamePlatform,
            completionDate: gameCompletionDate || null,
            metacriticScore: gameMetacriticScore || null,
            cover: coverData
        };

        this.saveGames();
        this.renderGames();
        this.closeModal();
        
        this.showNotification('游戏信息更新成功！', 'success');
    }

    saveGameWithCover(gameName, gameOriginalName, gamePlatform, completionDate, gameMetacriticScore, coverData) {
        const game = {
            id: Date.now(),
            name: gameName,
            originalName: gameOriginalName, // 添加原名
            platform: gamePlatform,
            completionDate: completionDate || null,
            metacriticScore: gameMetacriticScore || null,
            cover: coverData,
            notes: '', // 备注信息移除
            addedAt: new Date().toISOString()
        };

        this.games.push(game);
        this.saveGames();
        this.renderGames();
        this.closeModal();
        
        // 显示成功消息
        this.showNotification('游戏添加成功！', 'success');
    }

    resetForm() {
        document.getElementById('addGameForm').reset();
        document.getElementById('coverPreview').style.display = 'none';
        document.getElementById('previewImage').src = '';
        
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

    saveGames() {
        localStorage.setItem('games', JSON.stringify(this.games));
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

    renderGames() {
        const gamesList = document.getElementById('gamesList');

        if (this.games.length === 0) {
            gamesList.innerHTML = `
                <div class="no-games">
                    <i class="fas fa-gamepad"></i>
                    <h3>还没有游戏记录</h3>
                    <p>点击右上角的 + 按钮添加第一个游戏</p>
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
        sortedYears.forEach(year => {
            const yearGames = gamesByYear[year];
            
            html += `
                <div class="year-section">
                    <div class="year-title">
                        <i class="fas fa-calendar"></i>
                        <span>${year}年通关游戏</span>
                        <span class="game-count">${yearGames.length}个</span>
                    </div>
                    <div class="games-grid">
                        ${yearGames.map(game => this.createGameCard(game)).join('')}
                    </div>
                </div>
            `;
        });
        
        // 渲染没有通关日期的游戏
        if (gamesWithoutDate.length > 0) {
            html += `
                <div class="year-section">
                    <div class="year-title">
                        <i class="fas fa-clock"></i>
                        <span>未通关游戏</span>
                        <span class="game-count">${gamesWithoutDate.length}个</span>
                    </div>
                    <div class="games-grid">
                        ${gamesWithoutDate.map(game => this.createGameCard(game)).join('')}
                    </div>
                </div>
            `;
        }

        gamesList.innerHTML = html;
    }

    createGameCard(game) {
        const coverImage = game.cover ? 
            `<img src="${this.escapeHtml(game.cover)}" alt="${this.escapeHtml(game.name)}" class="game-cover">` : 
            `<div class="game-cover-placeholder">
                <i class="fas fa-gamepad"></i>
            </div>`;

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
                         ${game.metacriticScore ? `
                             <div class="game-metacritic-score">
                                 <i class="fas fa-star"></i>
                                 <span>Metacritic: ${game.metacriticScore}</span>
                             </div>
                         ` : ''}
                     </div>
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

    async fetchMetacriticScore() {
        const gameOriginalName = document.getElementById('gameOriginalName').value.trim();
        const gameName = document.getElementById('gameName').value.trim();
        
        // 优先使用原名，如果没有原名则使用游戏名称
        const searchTerm = gameOriginalName || gameName;
        
        if (!searchTerm) {
            this.showNotification('请先输入游戏名称或原名！', 'error');
            return;
        }

        const fetchBtn = document.getElementById('fetchMetacriticBtn');
        const originalText = fetchBtn.innerHTML;
        fetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 搜索中...';
        fetchBtn.disabled = true;

        try {
            // 由于CORS限制，我们提供一个搜索链接供用户手动查看
            const searchUrl = `https://www.metacritic.com/search/${encodeURIComponent(searchTerm)}`;
            
            // 打开新窗口让用户查看Metacritic评分
            window.open(searchUrl, '_blank');
            
            this.showNotification('已打开Metacritic搜索页面，请手动查看评分', 'info');
            
        } catch (error) {
            console.error('打开Metacritic搜索失败:', error);
            this.showNotification('无法打开Metacritic搜索页面', 'error');
        } finally {
            fetchBtn.innerHTML = originalText;
            fetchBtn.disabled = false;
        }
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
        const platformItems = document.querySelectorAll('.platform-item');
        
        platformItems.forEach(item => {
            item.setAttribute('draggable', 'true');
            
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.dataset.platformId);
                item.classList.add('dragging');
            });
            
            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
            });
        });

        const platformList = document.getElementById('platformList');
        
        platformList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.dragging');
            if (!draggingItem) return;
            
            const afterElement = this.getDragAfterElement(platformList, e.clientY);
            if (afterElement) {
                platformList.insertBefore(draggingItem, afterElement);
            } else {
                platformList.appendChild(draggingItem);
            }
        });

        platformList.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedPlatformId = e.dataTransfer.getData('text/plain');
            this.updatePlatformOrder();
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

    updatePlatformOrder() {
        const platformItems = document.querySelectorAll('.platform-item');
        const newOrder = [];
        
        platformItems.forEach(item => {
            const platformId = item.dataset.platformId;
            const platform = this.platforms.find(p => p.id === platformId);
            if (platform) {
                newOrder.push(platform);
            }
        });
        
        this.platforms = newOrder;
        this.savePlatforms();
        this.updatePlatformOptions();
        this.renderGames();
        this.showNotification('平台顺序已更新！', 'success');
    }

    createPlatformItem(platform) {
        return `
            <div class="platform-item" data-platform-id="${platform.id}">
                <div class="platform-icon" style="background: ${platform.color}">
                    <i class="${platform.icon}"></i>
                </div>
                <div class="platform-info">
                    <div class="platform-name">${this.escapeHtml(platform.name)}</div>
                    <div class="platform-color">${platform.color}</div>
                </div>
                <div class="platform-actions">
                    <button class="btn btn-secondary btn-sm" onclick="gameTracker.editPlatform('${platform.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="gameTracker.deletePlatform('${platform.id}')">
                        <i class="fas fa-trash"></i>
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
                <i class="${platform.icon}"></i>
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
                    <button type="submit" class="btn btn-primary btn-sm">
                        <i class="fas fa-save"></i>
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="gameTracker.cancelEditPlatform('${platformId}')">
                        <i class="fas fa-times"></i>
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
            icon: 'fas fa-gamepad'
        };

        this.platforms.push(newPlatform);
        this.savePlatforms();
        this.renderPlatformList();
        this.updatePlatformOptions();
        this.editPlatform(newId);
    }

    savePlatforms() {
        localStorage.setItem('platforms', JSON.stringify(this.platforms));
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
                        case 'metacriticScore':
                            aValue = a.metacriticScore ? parseInt(a.metacriticScore) : 0;
                            bValue = b.metacriticScore ? parseInt(b.metacriticScore) : 0;
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

    exportData() {
        const data = {
            games: this.games,
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
    }

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (data.games && Array.isArray(data.games)) {
                        this.games = data.games;
                        this.saveGames();
                    }
                    
                    if (data.platforms && Array.isArray(data.platforms)) {
                        this.platforms = data.platforms;
                        this.savePlatforms();
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
                    this.renderGames();
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
}

// 初始化应用
const gameTracker = new GameTracker(); 