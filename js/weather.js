// js/modules/weather.js
const WeatherManager = {
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

    async fetchWeather(loc, item) {
        if (!loc) return { error: true };
        try {
            let lat, lon;
            if (item.lat && item.lng) {
                lat = item.lat;
                lon = item.lng;
            } else if (MapManager.locationCache && MapManager.locationCache[loc]) {
                lat = MapManager.locationCache[loc].lat;
                lon = MapManager.locationCache[loc].lng;
            } else if (typeof google !== 'undefined') {
                const geocoder = new google.maps.Geocoder();
                const results = await new Promise((resolve) => {
                    const timeoutId = setTimeout(() => { resolve(null); }, 2000);
                    geocoder.geocode({ address: loc }, (res, status) => {
                        clearTimeout(timeoutId);
                        if (status === 'OK') resolve(res);
                        else resolve(null);
                    });
                });
                if (results && results.length > 0) {
                    lat = results[0].geometry.location.lat();
                    lon = results[0].geometry.location.lng();
                    MapManager.locationCache[loc] = { lat: lat, lng: lon };
                    localStorage.setItem('myTripLocationCache', JSON.stringify(MapManager.locationCache));
                } else {
                    return { error: true };
                }
            } else {
                return { error: true };
            }

            const weatherResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`);
            const weatherData = await weatherResp.json();
            
            if (weatherData && weatherData.current) {
                const temp = Math.round(weatherData.current.temperature_2m);
                const code = weatherData.current.weather_code;
                const info = this.getWeatherInfo(code);
                return { temp: `${temp}°C`, desc: info.desc, icon: info.icon, loading: false };
            } else {
                return { error: true };
            }
        } catch (err) {
            return { error: true };
        }
    }
};