// js/modules/weather.js

window.WeatherManager = {
    cityMap: {}, 
    uniqueCities: [],
    currentSelectedCity: null,
    forecastCache: {},

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

    // 啟動天氣總覽視圖
    async initWeatherView(itinerariesData, daysData) {
        const tabsContainer = document.getElementById('weather-location-tabs');
        const contentContainer = document.getElementById('weather-forecast-content');
        
        if (!tabsContainer || !contentContainer) return;

        if (!itinerariesData || !daysData) {
            contentContainer.innerHTML = `
                <div class="text-center text-xs text-red-500 py-12 bg-red-50 rounded-2xl mx-2 border border-red-200">
                    <i class="fa-solid fa-triangle-exclamation text-3xl mb-3"></i>
                    <p class="font-bold mb-1">系統無法讀取行程資料</p>
                    <p class="text-[10px] opacity-80">請確認是否已完成 app.js 的參數傳遞修正。</p>
                </div>`;
            return;
        }
        
        let rawLocations = [];
        
        // 蒐集所有景點
        for (let i = 0; i < Object.keys(itinerariesData).length; i++) {
            const dayItems = itinerariesData[i] || [];
            dayItems.forEach(item => {
                if (['景點', '機場', '住宿', '車站', '港口', '餐廳'].includes(item.category) && item.location) {
                    if (!rawLocations.includes(item.location)) {
                        rawLocations.push(item.location);
                    }
                }
            });
        }
        
        // 防呆：無景點
        if (rawLocations.length === 0) {
            tabsContainer.innerHTML = '';
            contentContainer.innerHTML = `
                <div class="text-center text-xs text-text-sub py-12 bg-[#FAF6EB] rounded-2xl shadow-sm border border-gray-200 mx-2">
                    <i class="fa-solid fa-location-dot text-3xl text-gray-300 mb-3"></i>
                    <p class="font-bold text-gray-500 text-sm mb-1">行程中尚未安排景點</p>
                    <p class="text-[10px] opacity-70 mt-2">請先至「日常行程」新增目的地<br>系統將自動為您歸類並抓取當地天氣</p>
                </div>`;
            return;
        }

        // 顯示正在轉換城市的 Loading 動畫
        tabsContainer.innerHTML = '';
        contentContainer.innerHTML = `
            <div class="text-center text-xs text-text-sub py-12 bg-[#FAF6EB] rounded-2xl shadow-sm border border-gray-200 mx-2">
                <i class="fa-solid fa-satellite-dish fa-spin text-3xl text-morandi mb-3"></i>
                <p class="font-bold text-gray-500 text-sm mb-1">正在自動定位所屬城市...</p>
                <p class="text-[10px] opacity-70 mt-2">使用免費全球地理資料庫轉換中</p>
            </div>`;

        // 將景點轉換為大城市並合併去重複
        await this.mapLocationsToCities(rawLocations);

        // 預設選擇第一個城市
        if (!this.currentSelectedCity || !this.uniqueCities.includes(this.currentSelectedCity)) {
            this.currentSelectedCity = this.uniqueCities[0];
        }

        this.renderTabs();
        this.loadAndRenderForecast(this.currentSelectedCity);
    },

    // 🌟 核心新功能：ArcGIS (精準座標與當地發音) + BigDataCloud (強制繁體中文翻譯) 完美雙語合併
    async mapLocationsToCities(locations) {
        let citiesSet = new Set();
        
        for (const loc of locations) {
            if (!this.cityMap[loc]) {
                try {
                    // 1. 呼叫 ArcGIS 獲取準確經緯度與「當地原生名稱」 (例如日本會回傳平假名)
                    const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine=${encodeURIComponent(loc)}&f=json&maxLocations=1&outFields=City,Region`;
                    const res = await fetch(arcgisUrl);
                    const data = await res.json();
                    
                    if (data.candidates && data.candidates.length > 0) {
                        const candidate = data.candidates[0];
                        const attrs = candidate.attributes || {};
                        const lat = candidate.location.y;
                        const lon = candidate.location.x;
                        
                        // 提取當地名稱 (例如：ちばけん、はかたく、中正區)
                        let arcgisCity = attrs.City || '';
                        let arcgisRegion = attrs.Region || '';
                        let localName = arcgisCity.trim() !== '' ? arcgisCity : arcgisRegion;
                        if (!localName) localName = loc;

                        // 2. 呼叫 BigDataCloud 逆向地理編碼，傳入經緯度強制索取「繁體中文」名稱
                        let zhName = localName;
                        try {
                            const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh-TW`;
                            const bdcRes = await fetch(bdcUrl);
                            const bdcData = await bdcRes.json();
                            
                            let bdcCity = bdcData.city || '';
                            let bdcSubdiv = bdcData.principalSubdivision || '';
                            let bdcLocality = bdcData.locality || '';
                            
                            // 根據 ArcGIS 給出的層級，智慧匹配最適合的中文名
                            zhName = bdcCity || bdcSubdiv || bdcLocality || localName;
                            if (localName === arcgisRegion && arcgisRegion !== '') {
                                zhName = bdcSubdiv || zhName;
                            } else if (localName === arcgisCity && arcgisCity !== '') {
                                zhName = bdcLocality || bdcCity || zhName;
                            }
                        } catch(err) {
                            console.warn("API 翻譯失敗，將使用原名", err);
                        }
                        
                        // 美化：乾淨俐落地拿掉各國常見的行政區字尾
        zhName = zhName.replace(/(市|縣|特別區|區|道|府|州)$/, '');
        localName = localName.replace(/(市|県|縣|特别区|特別區|区|區|시|도|구)$/i, '');

        // 3. 組裝雙語名稱
        let finalCityName = zhName;
        
        // 【新增判斷】：利用正規表達式檢查 localName 是否「全為中文字」。若包含外文(日/韓)才加上括號。
        const isLocalAllChinese = /^[\u4E00-\u9FFF]+$/.test(localName);
        
        if (zhName !== localName && !zhName.toLowerCase().includes(localName.toLowerCase()) && !isLocalAllChinese) {
            finalCityName = `${zhName} (${localName})`;
        }

        this.cityMap[loc] = {
            cityName: finalCityName,
            lat: lat,
            lon: lon
        };
                    } else {
                        // 查無資料時防呆
                        this.cityMap[loc] = { cityName: loc, lat: null, lon: null };
                    }
                } catch(e) {
                    this.cityMap[loc] = { cityName: loc, lat: null, lon: null };
                }
            }
            // 加入 Set 確保城市名稱不重複
            citiesSet.add(this.cityMap[loc].cityName);
        }
        
        this.uniqueCities = Array.from(citiesSet);
    },

    // 渲染城市水平標籤列
    renderTabs() {
        const container = document.getElementById('weather-location-tabs');
        if(!container) return;
        
        // 【新增排版修正】：移除水平捲動，改為 flex 彈性自動換行 (flex-wrap) 與網格間距 (gap-3)
        container.classList.remove('overflow-x-auto', 'space-x-3', 'hide-scrollbar');
        container.classList.add('flex-wrap', 'gap-3', 'flex');
        
        container.innerHTML = this.uniqueCities.map(city => {
            const isSelected = this.currentSelectedCity === city;
            // 標籤雲字數若過長，從 6 個字放寬到 8 個字，避免把括號內的日文卡掉
            const shortName = city.length > 50 ? city.substring(0, 50) + '...' : city;
            return `
                <div onclick="window.WeatherManager.selectLocation('${city}')" 
                     class="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all duration-300 shadow-sm
                     ${isSelected ? 'bg-[#1e293b] text-white' : 'bg-white text-text-sub border border-gray-200 hover:bg-[#F4EFE6]'}"
                     style="white-space: nowrap;">
                    ${shortName}
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

        // 從快取中反向找回屬於這個城市的一組有效經緯度
        let targetLat = null;
        let targetLon = null;
        for (const loc in this.cityMap) {
            if (this.cityMap[loc].cityName === city && this.cityMap[loc].lat !== null) {
                targetLat = this.cityMap[loc].lat;
                targetLon = this.cityMap[loc].lon;
                break; // 找到一個代表性的座標即可
            }
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
