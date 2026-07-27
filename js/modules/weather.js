// js/modules/weather.js

window.WeatherManager = {
    savedCities: [], // 儲存使用者手動新增的城市 [{name, lat, lon}]
    currentSelectedCity: null,
    forecastCache: {},
    searchTimeout: null, // 搜尋防抖動計時器

    // 氣象代碼轉換
    getWeatherInfo(code) {
        const wmo = { 
            0:{icon:'☀️',desc:'晴天'}, 1:{icon:'🌤️',desc:'大致晴朗'}, 2:{icon:'⛅',desc:'部分多雲'}, 
            3:{icon:'☁️',desc:'陰天'}, 45:{icon:'🌫️',desc:'霧'}, 48:{icon:'🌫️',desc:'霧淞'}, 
            51:{icon:'🌦️',desc:'小毛毛雨'}, 53:{icon:'🌦️',desc:'中毛毛雨'}, 55:{icon:'🌧️',desc:'大毛毛雨'}, 
            61:{icon:'🌧️',desc:'小雨'}, 63:{icon:'🌧️',desc:'中雨'}, 65:{icon:'🌧️',desc:'大雨'}, 
            71:{icon:'❄️',desc:'小雪'}, 73:{icon:'❄️',desc:'中雪'}, 75:{icon:'❄️',desc:'大雪'}, 
            77:{icon:'🌨️',desc:'冰晶'}, 80:{icon:'🌦️',desc:'陣雨'}, 81:{icon:'🌧️',desc:'中陣雨'}, 
            82:{icon:'⛈️',desc:'大陣雨'}, 85:{icon:'🌨️',desc:'陣雪'}, 86:{icon:'🌨️',desc:'大陣雪'}, 
            95:{icon:'⛈️',desc:'雷陣雨'}, 96:{icon:'⛈️',desc:'雷陣雨夾冰雹'}, 99:{icon:'⛈️',desc:'強雷陣雨夾冰雹'} 
        };
        return wmo[code] || { icon: '🌡️', desc: '未知' };
    },

    // 啟動天氣總覽視圖 (手動搜尋模式，同步至 Vue 行程檔)
    async initWeatherView() {
        const tabsContainer = document.getElementById('weather-location-tabs');
        const contentContainer = document.getElementById('weather-forecast-content');
        if (!tabsContainer || !contentContainer) return;

        // 從 Vue 實體讀取綁定行程的城市清單
        if (window.vueAppInstance) {
            if (!window.vueAppInstance.weatherCities) {
                window.vueAppInstance.weatherCities = [];
            }
            this.savedCities = window.vueAppInstance.weatherCities;
        } else {
            this.savedCities = [];
        }

        // 預設選擇第一個城市
        if (!this.currentSelectedCity || !this.savedCities.find(c => c.name === this.currentSelectedCity)) {
            this.currentSelectedCity = this.savedCities.length > 0 ? this.savedCities[0].name : null;
        }

        this.renderTabs();
        if (this.currentSelectedCity) {
            this.loadAndRenderForecast(this.currentSelectedCity);
        } else {
            contentContainer.innerHTML = `
                <div class="text-center text-xs text-text-sub py-12 bg-[#FAF6EB] rounded-2xl shadow-sm border border-gray-200 mx-2">
                    <i class="fa-solid fa-location-dot text-3xl text-gray-300 mb-3"></i>
                    <p class="font-bold text-gray-500 text-sm mb-1">尚未加入任何城市</p>
                    <p class="text-[10px] opacity-70 mt-2">請使用上方搜尋列加入天氣預報地點</p>
                </div>`;
        }
    },

    // 🌟 同步至 Vue 實體，以便跟隨 JSON 存檔上雲端
    syncToVue() {
        if (window.vueAppInstance) {
            window.vueAppInstance.weatherCities = this.savedCities;
        }
    },

    // 🌟 處理搜尋框輸入 (Debounce 防抖動)
    handleSearchInput(event) {
        const keyword = event.target.value.trim();
        const clearBtn = document.getElementById('weather-search-clear');
        
        if (keyword.length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
            document.getElementById('weather-search-results').classList.add('hidden');
            return;
        }

        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.executeSearch(keyword);
        }, 500);
    },

    // 🌟 清除搜尋
    clearSearch() {
        const input = document.getElementById('weather-search-input');
        input.value = '';
        document.getElementById('weather-search-clear').classList.add('hidden');
        document.getElementById('weather-search-results').classList.add('hidden');
        input.focus();
    },

    // 🌟 顯示搜尋結果
    showSearchResults() {
        const input = document.getElementById('weather-search-input');
        if (input.value.trim().length > 0) {
            document.getElementById('weather-search-results').classList.remove('hidden');
        }
    },

    // 🌟 呼叫 OpenStreetMap API 搜尋城市 (全球在地化最精準、完全免費)
    async executeSearch(keyword) {
        const resultsContainer = document.getElementById('weather-search-results');
        resultsContainer.innerHTML = `<div class="p-4 text-center text-xs text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>搜尋中...</div>`;
        resultsContainer.classList.remove('hidden');

        try {
            // 改用 OpenStreetMap (Nominatim)，對台灣與日本的在地地標、繁體中文支援度極高！
            const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&limit=5&accept-language=zh-TW`;
            const res = await fetch(osmUrl);
            const data = await res.json();

            if (data && data.length > 0) {
                resultsContainer.innerHTML = data.map(item => {
                    // 提取 OSM 整理好的顯示名稱
                    let displayName = item.display_name || keyword;
                    displayName = displayName.replace(/'/g, "\\'"); 
                    
                    // OSM 會回傳極度詳細的完整門牌地址 (例如: 臺灣桃園國際機場, 9, 航站南路...)
                    // 為了讓天氣標籤乾淨漂亮，我們直接切斷，只取逗號分隔的「第一個」主要名稱！
                    const nameParts = displayName.split(', ');
                    displayName = nameParts[0];
                    
                    const lat = parseFloat(item.lat);
                    const lon = parseFloat(item.lon);
                    
                    return `
                        <div class="px-4 py-3 hover:bg-[#F4EFE6] cursor-pointer transition-colors flex items-center justify-between border-b border-gray-50 last:border-0"
                             onclick="window.WeatherManager.addCity('${displayName}', ${lat}, ${lon})">
                            <div class="flex flex-col">
                                <span class="text-sm font-bold text-text-main">${displayName}</span>
                                <span class="text-[10px] text-text-sub mt-0.5">緯度: ${lat.toFixed(2)}, 經度: ${lon.toFixed(2)}</span>
                            </div>
                            <i class="fa-solid fa-plus text-morandi"></i>
                        </div>
                    `;
                }).join('');
            } else {
                resultsContainer.innerHTML = `<div class="p-4 text-center text-xs text-gray-500">查無相符的地點</div>`;
            }
        } catch (error) {
            resultsContainer.innerHTML = `<div class="p-4 text-center text-xs text-red-400">網路連線異常，搜尋失敗</div>`;
        }
    },

    // 🌟 將選中的城市加入標籤列
    addCity(name, lat, lon) {
        if (!this.savedCities.find(c => c.name === name)) {
            this.savedCities.push({ name, lat, lon });
            this.syncToVue();
        }
        
        this.currentSelectedCity = name;
        this.clearSearch();
        this.renderTabs();
        this.loadAndRenderForecast(name);
    },

    // 🌟 刪除城市
    removeCity(event, name) {
        event.stopPropagation();
        this.savedCities = this.savedCities.filter(c => c.name !== name);
        this.syncToVue();
        
        if (this.currentSelectedCity === name) {
            this.currentSelectedCity = this.savedCities.length > 0 ? this.savedCities[0].name : null;
        }
        
        this.renderTabs();
        if (this.currentSelectedCity) {
            this.loadAndRenderForecast(this.currentSelectedCity);
        } else {
            document.getElementById('weather-forecast-content').innerHTML = `
                <div class="text-center text-xs text-text-sub py-12 bg-[#FAF6EB] rounded-2xl shadow-sm border border-gray-200 mx-2">
                    <i class="fa-solid fa-cloud-sun text-3xl text-gray-300 mb-3"></i>
                    <p class="font-bold text-gray-500 text-sm mb-1">城市清單為空</p>
                    <p class="text-[10px] opacity-70 mt-2">請使用上方搜尋列加入天氣預報地點</p>
                </div>`;
        }
    },

    // 渲染城市水平標籤列 (支援滑鼠懸停顯示刪除按鈕 X)
    renderTabs() {
        const container = document.getElementById('weather-location-tabs');
        if(!container) return;
        
        container.classList.remove('overflow-x-auto', 'space-x-3', 'hide-scrollbar');
        container.classList.add('flex-wrap', 'gap-3', 'flex');
        
        container.innerHTML = this.savedCities.map(cityObj => {
            const city = cityObj.name;
            const isSelected = this.currentSelectedCity === city;
            // 縮短名稱以節省版面 (例: 日本 京都府 宇治市 -> 宇治市)
            const shortName = city.length > 12 ? city.slice(-10) : city; 
            
            return `
                <div onclick="window.WeatherManager.selectLocation('${city}')" 
                     class="group px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all duration-300 shadow-sm flex items-center
                     ${isSelected ? 'bg-[#1e293b] text-white' : 'bg-white text-text-sub border border-gray-200 hover:bg-[#F4EFE6]'}"
                     style="white-space: nowrap;">
                    ${shortName}
                    <button onclick="window.WeatherManager.removeCity(event, '${city}')" 
                            class="ml-2 w-4 h-4 rounded-full flex items-center justify-center transition-colors 
                            ${isSelected ? 'hover:bg-slate-500 text-slate-300 hover:text-white' : 'hover:bg-gray-200 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100'}">
                        <i class="fa-solid fa-xmark text-[10px]"></i>
                    </button>
                </div>
            `;
        }).join('');
    },

    selectLocation(city) {
        this.currentSelectedCity = city;
        this.renderTabs();
        this.loadAndRenderForecast(city);
    },

    // 載入預報資料並渲染內容
    async loadAndRenderForecast(city) {
        const content = document.getElementById('weather-forecast-content');
        
        if (this.forecastCache[city]) {
            this.renderForecastUI(city, this.forecastCache[city]);
            return;
        }

        content.innerHTML = `
            <div class="text-center text-xs text-text-sub py-12 flex flex-col items-center bg-white rounded-2xl shadow-sm border border-gray-100 mx-2">
                <i class="fa-solid fa-spinner fa-spin text-3xl text-morandi mb-4"></i>
                <p class="font-bold text-sm text-text-main">氣象衛星連線中...</p>
                <p class="text-[10px] mt-1 opacity-70">正在獲取「${city}」的 14 天預報</p>
            </div>`;

        // 從 savedCities 中直接反向找回經緯度
        let targetLat = null;
        let targetLon = null;
        const cityObj = this.savedCities.find(c => c.name === city);
        if (cityObj) {
            targetLat = cityObj.lat;
            targetLon = cityObj.lon;
        }

        if (targetLat === null || targetLon === null) {
            content.innerHTML = `
                <div class="text-center text-xs text-red-500 py-10 bg-red-50 border border-red-100 rounded-2xl mx-2 shadow-sm">
                    <i class="fa-solid fa-location-dot text-2xl mb-2"></i>
                    <p class="font-bold mb-1">無法定位地理座標</p>
                    <p class="text-[10px] opacity-80 mt-1">地理庫查無「${city}」的準確位置。<br>請嘗試修改行程中的景點名稱使其更精確。</p>
                </div>`;
            return;
        }

        try {
            // 呼叫 Open-Meteo 獲取未來預報與降雨機率
            const weatherResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${targetLat}&longitude=${targetLon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=celsius&timezone=auto&forecast_days=14`);
            const weatherData = await weatherResp.json();
            
            if (weatherData && weatherData.daily) {
                this.forecastCache[city] = weatherData.daily;
                this.renderForecastUI(city, weatherData.daily);
            } else {
                throw new Error("API 無效回應");
            }
        } catch (err) {
            content.innerHTML = `
                <div class="text-center text-xs text-red-500 py-10 bg-red-50 border border-red-100 rounded-2xl mx-2 shadow-sm">
                    <i class="fa-solid fa-cloud-bolt text-2xl mb-2"></i>
                    <p class="font-bold mb-1">取得天氣失敗</p>
                    <p class="text-[10px] opacity-80">請檢查網路連線或稍後再試。</p>
                </div>`;
        }
    },

    // UI 介面渲染 (維持原有的深色質感介面不變)
    renderForecastUI(loc, dailyData) {
        const content = document.getElementById('weather-forecast-content');
        if (!content) return;

        const dates = dailyData.time;
        const maxTemps = dailyData.temperature_2m_max;
        const minTemps = dailyData.temperature_2m_min;
        const codes = dailyData.weather_code;
        const pops = dailyData.precipitation_probability_max; 

        // 格式化日期 MM/DD
        const todayStr = dates[0].substring(5).replace('-','/');
        const tomorrowStr = dates[1].substring(5).replace('-','/');

        // 頂部 今日/明日 卡片
        const topBanner = `
            <div class="bg-[#1e293b] text-white rounded-2xl p-4 flex justify-around items-center shadow-lg mb-4 mx-1 mt-1 border border-[#334155]">
                <div class="flex flex-col items-center flex-1 border-r border-[#334155]">
                    <span class="text-xs text-slate-400 font-bold mb-2 tracking-widest"><i class="fa-regular fa-sun mr-1"></i>今日 ${todayStr}</span>
                    <div class="flex items-center space-x-3 mb-1">
                        <span class="text-4xl drop-shadow-md">${this.getWeatherInfo(codes[0]).icon}</span>
                        <div class="flex flex-col">
                            <span class="text-sm font-black text-red-400">${Math.round(maxTemps[0])}°</span>
                            <span class="text-sm font-black text-blue-300">${Math.round(minTemps[0])}°</span>
                        </div>
                    </div>
                    <span class="text-[11px] text-slate-300 bg-[#334155] px-2 py-0.5 rounded-full mt-1 flex items-center">
                        ${this.getWeatherInfo(codes[0]).desc} <span class="mx-1">|</span> <i class="fa-solid fa-droplet text-blue-400 mr-1"></i>${pops[0] || 0}%
                    </span>
                </div>
                
                <div class="flex flex-col items-center flex-1">
                    <span class="text-xs text-slate-400 font-bold mb-2 tracking-widest"><i class="fa-solid fa-arrow-right mr-1"></i>明日 ${tomorrowStr}</span>
                    <div class="flex items-center space-x-3 mb-1">
                        <span class="text-4xl drop-shadow-md">${this.getWeatherInfo(codes[1]).icon}</span>
                        <div class="flex flex-col">
                            <span class="text-sm font-black text-red-400">${Math.round(maxTemps[1])}°</span>
                            <span class="text-sm font-black text-blue-300">${Math.round(minTemps[1])}°</span>
                        </div>
                    </div>
                    <span class="text-[11px] text-slate-300 bg-[#334155] px-2 py-0.5 rounded-full mt-1 flex items-center">
                         ${this.getWeatherInfo(codes[1]).desc} <span class="mx-1">|</span> <i class="fa-solid fa-droplet text-blue-400 mr-1"></i>${pops[1] || 0}%
                    </span>
                </div>
            </div>
        `;

        // 底部 未來 2 週預報列表
        let listHtml = `
            <div class="bg-[#1e293b] rounded-2xl p-5 shadow-lg border border-[#334155] mx-1">
                <h3 class="text-slate-200 font-bold text-sm mb-4 pb-3 border-b border-[#334155] tracking-widest">
                    <i class="fa-solid fa-calendar-days mr-2 text-slate-400"></i>2週間天氣
                </h3>
                <div class="space-y-4">
        `;
                        
        for (let i = 2; i < dates.length; i++) {
            const dateObj = new Date(dates[i]);
            const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()];
            const dayColor = (dayOfWeek === '六') ? 'text-blue-300' : (dayOfWeek === '日' ? 'text-red-400' : 'text-slate-300');
            const dateLabel = `${dates[i].substring(5).replace('-','/')}(<span class="${dayColor}">${dayOfWeek}</span>)`;
            
            listHtml += `
                <div class="flex items-center justify-between text-white text-xs border-b border-[#334155] pb-3 last:border-0 last:pb-0">
                    <span class="w-16 font-medium tracking-wider text-slate-300">${dateLabel}</span>
                    <div class="flex items-center space-x-2 w-16">
                        <span class="text-2xl drop-shadow-sm w-8 text-center">${this.getWeatherInfo(codes[i]).icon}</span>
                    </div>
                    <div class="flex w-16 justify-center space-x-4">
                        <span class="text-red-400 font-bold text-sm">${Math.round(maxTemps[i])}</span>
                        <span class="text-blue-300 font-bold text-sm">${Math.round(minTemps[i])}</span>
                    </div>
                    <span class="w-12 text-right text-slate-400 font-medium">
                        <i class="fa-solid fa-droplet text-blue-500 mr-1 text-[10px]"></i>${pops[i] || 0}%
                    </span>
                </div>
            `;
        }
        
        listHtml += `</div></div>`;
        content.innerHTML = topBanner + listHtml;
    }
};
