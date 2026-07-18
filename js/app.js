// js/app.js
const { createApp } = Vue;

const appInstance = createApp({
    data() {        const urlParams = new URLSearchParams(window.location.search);
        const isGuestUrl = urlParams.get('guest') === '1';
        const isUnlockUrl = urlParams.get('unlock') === '1';
        const cleanUrl = window.location.origin + window.location.pathname;

        if (isUnlockUrl) {
            localStorage.removeItem('guestModeFlag');
            alert('🔓 管理者模式已成功解鎖！將自動重新載入主頁面。');
            window.location.href = cleanUrl; 
        } else if (isGuestUrl) {
            localStorage.setItem('guestModeFlag', 'true');
        }

        const finalIsGuest = isGuestUrl || localStorage.getItem('guestModeFlag') === 'true';

        return {
            isTravelGuest: finalIsGuest, // 變更詞彙，區隔記帳本
            isTravelMaster: false,      // 變更詞彙，區隔記帳本
            isSuperAdmin: false,        // 🌟 新增：存放由 Firebase 探測出來的最高權限
            currentUserUid: null,
            userPermissions: {},        // 新增：存放 GAS 取得的各項功能權限
            isTripLocked: false,
            appVersion: CONFIG.APP_VERSION,
            tripTitle: '我的全新旅程',
            isEditingTitle: false,
            currentTab: 'todo',
            dayViewMode: 'list',
            
            days: [],
            itineraries: {},

            todos: [
                { text: '確認護照效期大於六個月', done: true },
                { text: '投保旅遊平安險與不便險', done: false },
                { text: '開通網卡與雙重驗證開關', done: false }
            ],
            newTodoText: '',
            todoError: false,
            showShoppingModal: false,
            shoppingList: [
                { text: '合利他命 EX Plus * 2', bought: false },
                { text: '純米大吟釀 地酒 * 1', bought: false }
            ],
            newShoppingItem: '',

            showSyncModal: false,
            gasUrl: '',
            gasUrlError: false,
            isSyncing: false,
            syncMessage: '',
            syncSuccess: true,
            
            keepTemplates: true,
            cloudTrips: [],
            selectedCloudTrip: '',

            infoStation: {
                '資訊整理': [],
                '備用參考景點': [],
                '緊急醫療': []
            },
            showInfoModal: false,
            infoModalData: { category: '資訊整理', title: '', content: '' },

            showItineraryModal: false,
            modalMode: 'add',
            editItemIndex: null,
            modalData: { category: '景點', location: '', notes: '' },
            modalError: false,

            isMapLoading: false,
            loadingMapMsg: '',

            sortableInstance: null,
            weatherCache: {}
        };
    },
    computed: {
        currentThemeColor() {
            const matchaGreen = 'hsl(120, 20%, 50%)'; 
            if (this.currentDayIndex === null) return matchaGreen;
            
            const totalDays = Math.max(1, this.days.length);
            if (totalDays <= 1) return 'hsl(15, 70%, 60%)';
            
            const ratio = this.currentDayIndex / (totalDays - 1);
            const h = 15 + (120 - 15) * ratio;
            const s = 70 + (20 - 70) * ratio;
            const l = 60 + (50 - 60) * ratio; 
            
            return `hsl(${h}, ${s}%, ${l}%)`;
        },
        currentThemeColorLight() {
            const matchaGreenLight = 'hsl(120, 20%, 85%)';
            if (this.currentDayIndex === null) return matchaGreenLight;
            
            const totalDays = Math.max(1, this.days.length);
            if (totalDays <= 1) return 'hsl(15, 70%, 85%)';
            
            const ratio = this.currentDayIndex / (totalDays - 1);
            const h = 15 + (120 - 15) * ratio;
            const s = 70 + (20 - 70) * ratio;
            
            return `hsl(${h}, ${s}%, 85%)`;
        },
        currentDayIndex() {
            if (this.currentTab.startsWith('day-')) {
                return parseInt(this.currentTab.split('-')[1]);
            }
            return null;
        },
        currentItinerary() {
            if (this.currentDayIndex !== null && this.itineraries[this.currentDayIndex]) {
                return this.itineraries[this.currentDayIndex];
            }
            return [];
        },
        currentDayCompletedCount() {
            return this.currentItinerary.filter(item => item.completed).length;
        },
        currentDayProgress() {
            if (this.currentItinerary.length === 0) return 0;
            return Math.round((this.currentDayCompletedCount / this.currentItinerary.length) * 100);
        },
        remainingSpotsCount() {
            return this.currentItinerary.length - this.currentDayCompletedCount;
        },
        completedTodoCount() {
            return this.todos.filter(t => t.done).length;
        },
        remainingShoppingCount() {
            return this.shoppingList.filter(s => !s.bought).length;
        }
    },
   watch: {        
        tripTitle() { this.saveToLocal(); },
        linkTripId() { this.saveToLocal(); },
        days: { deep: true, handler() { this.saveToLocal(); } },
        itineraries: { deep: true, handler() { this.saveToLocal(); } },
        todos: { deep: true, handler() { this.saveToLocal(); } },
        shoppingList: { deep: true, handler() { this.saveToLocal(); } },
        infoStation: { deep: true, handler() { this.saveToLocal(); } },
        gasUrl() { this.saveToLocal(); }
    },
    mounted() {
        this.loadFromLocal();
        // 系統啟動時，抓取本地紀錄的使用者，向 GAS 獲取該人員對應的權限
        const currentUser = localStorage.getItem('currentUser') || 'guest';
        this.fetchUserPermissions(currentUser);
    },

methods: {
        checkPermission(action) {
            if (this.isSuperAdmin) return true;
            
            // 定義嚴格限定「管理者」才能執行的操作名稱 (可依據實際專案定義增減)
            const adminOnlyActions = ['manageSystem', 'manageUsers', 'assignPermissions', 'deleteProject'];
            
            // 如果是管理者專屬功能，才嚴格檢查 GAS 核發的權限
            if (adminOnlyActions.includes(action)) {
                return !!this.userPermissions[action];
            }
            
            // 一般訪客可以進行所有非管理者權限限定的全功能操作
            return true;
        },
        async fetchUserPermissions(username) {
            if (!this.gasUrl) return;
            const perms = await PermissionManager.loadPermissions(this.gasUrl, username);
            if (perms) {
                this.userPermissions = perms;
                this.isSuperAdmin = !!perms.isSuperAdmin;
            }
        },

        handleTabChange(tabName) {
            this.currentTab = tabName;
            if (tabName.startsWith('day-')) {
                if (this.dayViewMode === 'map') {
                    this.initMap();
                } else {
                    this.initSortable();
                }
            } else {
                MapManager.abortCurrentTasks();
            }
        },

        handleViewMode(mode) {
            this.dayViewMode = mode;
            if (mode === 'map') {
                this.initMap();
            } else {
                this.initSortable();
            }
        },
        
        // 必須補回此函式，否則 Vue 渲染會崩潰
        handleTabScroll(e) {
            if (e.deltaY !== 0) {
                e.preventDefault();
                this.$refs.tabsContainer.scrollLeft += e.deltaY;
            }
        },

        addNewDay() {
            const dateStr = prompt('請輸入這天的日期 (例如：10/24)：', '');
            if (dateStr && dateStr.trim() !== '') {
                const newIndex = this.days.length;
                this.days.push({ date: dateStr.trim() });
                this.itineraries[newIndex] = [];
                if (window.RecordManager) window.RecordManager.logAction('新增天數', { date: dateStr.trim() });
                this.handleTabChange('day-' + newIndex);
            }
        },
        deleteDay(index) {
            if(confirm(`確定要刪除 Day ${index + 1} (${this.days[index].date}) 以及裡面的所有行程嗎？`)) {
                this.days.splice(index, 1);
                const newItineraries = {};
                this.days.forEach((day, i) => {
                    newItineraries[i] = this.itineraries[i >= index ? i + 1 : i] || [];
                });
                this.itineraries = newItineraries;
                if (window.RecordManager) window.RecordManager.logAction('刪除天數', { dayIndex: index + 1 });
                this.handleTabChange('todo');
            }
        },
        editTitle() {
            this.isEditingTitle = true;
            this.$nextTick(() => { this.$refs.titleInput.focus(); });
        },
                initSortable() {
            this.$nextTick(() => {
                const el = this.$refs.itineraryList;
                if (!el) return;
                
                if (this.sortableInstance) {
                    this.sortableInstance.destroy();
                }
                
                this.sortableInstance = Sortable.create(el, {
                    handle: '.drag-handle',
                    animation: 150,
                    draggable: '.itinerary-item',
                    onEnd: (evt) => {
                        const oldIdx = evt.oldIndex;
                        const newIdx = evt.newIndex;
                        if (oldIdx !== newIdx) {
                            const list = this.itineraries[this.currentDayIndex];
                            const movedItem = list.splice(oldIdx, 1)[0];
                            list.splice(newIdx, 0, movedItem);
                            if (window.RecordManager) window.RecordManager.logAction('排序行程', { location: movedItem.location, from: oldIdx, to: newIdx });
                        }
                    }
                });
            });
        },
        getCategoryIcon(cat) {
            const icons = { '景點': '⛩️', '住宿': '🏨', '交通': '🚇', '航班': '✈️', '美食': '🍜', '購物': '🛍️', '其他': '📍' };
            return icons[cat] || '📍';
        },
        addTodo() {
            if (!this.newTodoText.trim()) {
                this.todoError = true;
                return;
            }
            this.todos.push({ text: this.newTodoText.trim(), done: false });
            if (window.RecordManager) window.RecordManager.logAction('新增待辦', { text: this.newTodoText.trim() });
            this.newTodoText = '';
            this.todoError = false;
        },
      deleteTodo(idx) {
            const deletedItem = this.todos[idx];
            this.todos.splice(idx, 1);
            if (window.RecordManager) window.RecordManager.logAction('刪除待辦', { text: deletedItem.text });
        },
       addShoppingItem() {
            if (this.newShoppingItem.trim()) {
                this.shoppingList.push({ text: this.newShoppingItem.trim(), bought: false });
                if (window.RecordManager) window.RecordManager.logAction('新增購物項目', { text: this.newShoppingItem.trim() });
                this.newShoppingItem = '';
            }
        },
       deleteShoppingItem(idx) {
            const deletedItem = this.shoppingList[idx];
            this.shoppingList.splice(idx, 1);
            if (window.RecordManager) window.RecordManager.logAction('刪除購物項目', { text: deletedItem.text });
        },
        getInfoCatIcon(cat) {
            if (cat === '資訊整理') return 'fa-solid fa-folder-open text-teal-600';
            if (cat === '備用參考景點') return 'fa-solid fa-map-pin text-amber-600';
            return 'fa-solid fa-heart-pulse text-red-500';
        },
        openAddInfoModal() {
            this.infoModalData = { category: '資訊整理', title: '', content: '' };
            this.showInfoModal = true;
        },
   saveInfoItem() {
            if (this.infoModalData.title && this.infoModalData.content) {
                this.infoStation[this.infoModalData.category].push({
                    title: this.infoModalData.title,
                    content: this.infoModalData.content
                });
                if (window.RecordManager) window.RecordManager.logAction('新增隨身資訊', { category: this.infoModalData.category, title: this.infoModalData.title });
                this.showInfoModal = false;
            }
        },
        deleteInfoItem(catName, idx) {
            const deletedItem = this.infoStation[catName][idx];
            this.infoStation[catName].splice(idx, 1);
            if (window.RecordManager) window.RecordManager.logAction('刪除隨身資訊', { category: catName, title: deletedItem.title });
        },
        openAddModal() {
            this.modalMode = 'add';
            this.modalError = false;
            this.modalData = { category: '景點', location: '', notes: '' };
            this.showItineraryModal = true;
        },
        openEditModal(idx) {
            this.modalMode = 'edit';
            this.modalError = false;
            this.editItemIndex = idx;
            const item = this.currentItinerary[idx];
            this.modalData = { ...item };
            this.showItineraryModal = true;
        },
        saveItineraryItem() {
            if (!this.modalData.location.trim()) {
                this.modalError = true;
                return;
            }
            if (this.modalMode === 'add') {
                const newItem = { 
                    ...this.modalData, 
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                    completed: false
                };
                this.itineraries[this.currentDayIndex].push(newItem);
                if (window.RecordManager) window.RecordManager.logAction('新增行程', { location: newItem.location, category: newItem.category });
                this.$nextTick(() => { this.fetchWeatherForItem(newItem); });
            } else {
                this.itineraries[this.currentDayIndex][this.editItemIndex] = { ...this.modalData };
                if (window.RecordManager) window.RecordManager.logAction('編輯行程', { location: this.modalData.location });
                this.$nextTick(() => { this.fetchWeatherForItem(this.itineraries[this.currentDayIndex][this.editItemIndex]); });
            }
            this.showItineraryModal = false;
            this.modalError = false;
            if (this.dayViewMode === 'map') this.updateMapMarkers();
        },
     deleteItineraryItem(idx) {
            const deletedItem = this.itineraries[this.currentDayIndex][idx];
            this.itineraries[this.currentDayIndex].splice(idx, 1);
            if (window.RecordManager) window.RecordManager.logAction('刪除行程', { location: deletedItem.location });
            if (this.dayViewMode === 'map') this.updateMapMarkers();
        },
        openExternalNav(idx) {
            const currentLoc = this.currentItinerary[idx].location;
            if (!currentLoc) return;
            let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentLoc)}`;
            if (idx > 0) {
                const prevLoc = this.currentItinerary[idx - 1].location;
                if (prevLoc) {
                    url += `&origin=${encodeURIComponent(prevLoc)}`;
                }
            }
            window.open(url, '_blank');
        },
        initMap() {
            this.$nextTick(() => {
                MapManager.init('map-canvas');
                this.updateMapMarkers();
            });
        },
        async updateMapMarkers() {
            const currentItems = this.currentItinerary;
            
            if (currentItems.length === 0) {
                MapManager.clearMarkers();
                this.isMapLoading = false;
                return;
            }

            await MapManager.updateMarkers(
                currentItems, 
                this.currentThemeColor,
                (isLoading, msg) => {
                    this.isMapLoading = isLoading;
                    if (msg) this.loadingMapMsg = msg;
                }
            );
        },
        triggerGeolocation() {
            const mapInst = MapManager.mapInstance;
            if (!mapInst || typeof google === 'undefined') return;
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((position) => {
                    const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
                    if (MapManager.userMarker) MapManager.userMarker.setMap(null);
                    MapManager.userMarker = new google.maps.Marker({
                        position: pos, map: mapInst, title: "您目前的位置",
                        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#f03', fillOpacity: 0.5, strokeColor: 'red', strokeWeight: 2 }
                    });
                    const infoWindow = new google.maps.InfoWindow({ content: "您目前的位置" });
                    MapManager.userMarker.addListener('click', () => infoWindow.open(mapInst, MapManager.userMarker));
                    mapInst.setCenter(pos);
                    mapInst.setZoom(15);
                }, () => {
                    alert('無法讀取 GPS 定位，請確認手機/瀏覽器定位權限已開啟。');
                });
            } else {
                alert('您的瀏覽器不支援定位功能。');
            }
        },
        async fetchWeatherForItem(item) {
            const loc = item.location;
            if (!loc) return;
            this.weatherCache = { ...this.weatherCache, [loc]: { loading: true } };
            const result = await WeatherManager.fetchWeather(loc, item);
            this.weatherCache = { ...this.weatherCache, [loc]: result };
        },
        async fetchAllWeather() {
            const items = this.currentItinerary;
            if (!items || items.length === 0) return;
            for (let i = 0; i < items.length; i++) {
                if (i > 0) await new Promise(r => setTimeout(r, 1200));
                await this.fetchWeatherForItem(items[i]);
            }
        },
        getAllData() {
            return JSON.stringify({ tripTitle: this.tripTitle, linkTripId: this.linkTripId, days: this.days, itineraries: this.itineraries, todos: this.todos, shoppingList: this.shoppingList, infoStation: this.infoStation, gasUrl: this.gasUrl, isTripLocked: this.isTripLocked });
        },
        saveToLocal() { localStorage.setItem('myTripAutoSave', this.getAllData()); },
        loadFromLocal() {
            const localData = localStorage.getItem('myTripAutoSave');
            if (localData) this.restoreData(localData, true);
        },
        restoreData(jsonStr, silent = false) {
            try {
                const data = JSON.parse(jsonStr);
                if (data.tripTitle !== undefined) this.tripTitle = data.tripTitle;
                if (data.linkTripId !== undefined) this.linkTripId = data.linkTripId;
                if (data.days) this.days = data.days;
                if (data.itineraries) this.itineraries = data.itineraries;
                if (data.todos) this.todos = data.todos;
                if (data.shoppingList) this.shoppingList = data.shoppingList;
                if (data.infoStation) this.infoStation = data.infoStation;
                if (data.gasUrl !== undefined) this.gasUrl = data.gasUrl;
                if (data.isTripLocked !== undefined) this.isTripLocked = data.isTripLocked;
                if (!silent) alert('資料還原成功！');
                if (this.dayViewMode === 'map') this.updateMapMarkers();
                this.showSyncModal = false;
            } catch (e) {
                if (!silent) alert('資料格式錯誤，還原失敗。');
            }
        },
                async copySyncCode() {
            try {
                // 修改：僅複製雲端目錄網址(GAS網頁連結)
                const codeToCopy = this.gasUrl ? this.gasUrl : '尚未設定 GAS 網頁連結';
                await navigator.clipboard.writeText(codeToCopy);
                alert('已複製雲端目錄網址 (GAS網頁連結)！您可至其他裝置貼上此連結。');
            } catch (e) {
                alert('瀏覽器不支援自動複製，請改用手動複製。');
            }
        },
        async pasteSyncCode() {
            try {
                const text = await navigator.clipboard.readText();
                if(text) this.restoreData(text);
            } catch (e) {
                const manualText = prompt('請手 শারীরিক上貼上行程代碼：');
                if(manualText) this.restoreData(manualText);
            }
        },
        downloadJSON() {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(this.getAllData());
            const downloadNode = document.createElement('a');
            downloadNode.setAttribute("href", dataStr);
            downloadNode.setAttribute("download", this.tripTitle + "-備份.json");
            document.body.appendChild(downloadNode);
            downloadNode.click();
            downloadNode.remove();
        },
        uploadJSON(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                this.restoreData(e.target.result);
                event.target.value = ''; 
            };
            reader.readAsText(file);
        },
        async createNewTrip() {
            const newTitle = prompt('請輸入新旅遊專案名稱：', '我的全新旅程');
            if (!newTitle) return;
            
            // 判斷是否保留智慧樣板資料
            if (!this.keepTemplates) {
                this.todos = [];
                this.shoppingList = [];
            }
            
            // 清空當前資料以迎接新專案
            this.tripTitle = newTitle;
            this.days = [];
            this.itineraries = {};
            this.currentTab = 'todo';
            
            if (this.gasUrl && !this.isTravelGuest) {
                this.isSyncing = true;
                this.syncMessage = '正在雲端建立新專案工作頁...';
                try {
                    // 呼叫 GAS 新增獨立工作頁
                    await API.createNewProject(this.gasUrl, newTitle);
                    await this.saveToCloud(); 
                    this.syncSuccess = true;
                    this.syncMessage = '新專案建立成功！';
                    this.fetchCloudList(); // 更新雲端目錄清單
                } catch (error) {
                    this.syncSuccess = false;
                    this.syncMessage = '建立失敗：' + error.message;
                } finally {
                    this.isSyncing = false;
                }
            } else {
                alert('已於本機建立新專案！若需跨裝置同步，請先設定 GAS 網址並備份。');
            }
        },
        async saveToCloud() {
            if (!this.gasUrl.trim()) {
                this.gasUrlError = true;
                return;
            }
            this.isSyncing = true;
            this.syncMessage = '正在上傳至雲端試算表...';
            try {
                await API.saveToCloud(this.gasUrl, this.tripTitle, this.getAllData());
                this.syncSuccess = true;
                this.syncMessage = '雲端備份成功！';
            } catch (error) {
                this.syncSuccess = false;
                this.syncMessage = '同步失敗：' + error.message;
            } finally {
                this.isSyncing = false;
            }
        },
        async archiveToCloud() {
            if (!this.gasUrl.trim()) {
                this.gasUrlError = true;
                return;
            }
            if (!confirm(`確定要封存「${this.tripTitle}」嗎？\n封存後，一般訪客將無法在雲端目錄中看到此行程。`)) return;
            
            this.isSyncing = true;
            this.syncMessage = '正在封存雲端行程...';
            try {
                await API.archiveToCloud(this.gasUrl, this.tripTitle);
                this.syncSuccess = true;
                this.syncMessage = '雲端行程封存成功！';
                this.fetchCloudList(); // 重新讀取目錄以更新下拉選單
            } catch (error) {
                this.syncSuccess = false;
                this.syncMessage = '封存失敗：' + error.message;
            } finally {
                this.isSyncing = false;
            }
        },
        async fetchCloudList() {
            if (!this.gasUrl.trim()) {
                this.gasUrlError = true;
                return;
            }
            this.isSyncing = true;
            this.syncMessage = '正在讀取雲端行程目錄...';
            try {
                // 取得當前登入者帳號，若無則預設為 guest
                const currentUser = localStorage.getItem('currentUser') || 'guest';
                
                // 將原本的 !this.isTravelGuest 改為傳遞帳號 currentUser，以利後端進行權限判斷
                const list = await API.fetchCloudList(this.gasUrl, currentUser);
                
                // 後端回傳的是物件陣列 [{name: '專案A', isArchived: false}, ...]
                // 將提取出來的專案名稱存入 cloudTrips 供選單使用
                this.cloudTrips = list.map(item => item.name);
                
                this.syncSuccess = true;
                this.syncMessage = '目錄讀取成功！請從下方選單選擇。';
            } catch (error) {
                this.syncSuccess = false;
                this.syncMessage = '目錄讀取失敗：' + error.message;
            } finally {
                this.isSyncing = false;
            }
        },
        async loadSelectedCloudTrip() {
            if (!this.selectedCloudTrip || !this.gasUrl) return;
            this.isSyncing = true;
            this.syncMessage = `正在下載「${this.selectedCloudTrip}」...`;
            
            const actualSheetName = this.selectedCloudTrip.replace(/^\[已封存\]\s*/, '');
            
            try {
                const data = await API.loadSelectedCloudTrip(this.gasUrl, actualSheetName);
                this.restoreData(data);
                
                // 【核心補齊】：載入不同專案行程後，必須立刻向 GAS 重新驗證該專案的人員權限配置
                const currentUser = localStorage.getItem('currentUser') || 'guest';
                await this.fetchUserPermissions(currentUser);
                
                this.syncSuccess = true;
                this.syncMessage = '雲端行程讀取成功！權限已重新套用。';
            } catch (error) {
                this.syncSuccess = false;
                this.syncMessage = '下載失敗：' + error.message;
            } finally {
                this.isSyncing = false;
            }
       }
    }
});

window.vueAppInstance = appInstance.mount('#app');
