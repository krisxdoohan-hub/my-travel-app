// js/modules/map.js
const MapManager = {
    mapInstance: null,
    markers: [],
    userMarker: null,
    geocoder: null,
    locationCache: JSON.parse(localStorage.getItem('myTripLocationCache') || '{}'), 
    abortController: null,
    
    init(elementId) {
        if (!this.mapInstance && typeof google !== 'undefined') {
            const mapEl = document.getElementById(elementId);
            if (mapEl) {
                this.mapInstance = new google.maps.Map(mapEl, {
                    center: { lat: 23.5, lng: 121 },
                    zoom: 7,
                    mapTypeControl: false,
                    streetViewControl: false
                });
                this.geocoder = new google.maps.Geocoder();
            }
        }
        return this.mapInstance;
    },

    clearMarkers() {
        this.markers.forEach(m => m.setMap(null));
        this.markers = [];
    },

    abortCurrentTasks() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
    },

    async updateMarkers(items, themeColor, loadingCallback) {
        this.abortCurrentTasks();
        const signal = this.abortController.signal;
        
        this.clearMarkers();
        
        if (!this.mapInstance || !this.geocoder || items.length === 0) {
            loadingCallback(false, '');
            return;
        }

        loadingCallback(true, '準備載入地圖標記...');
        const bounds = new google.maps.LatLngBounds();

        for (let i = 0; i < items.length; i++) {
            if (signal.aborted) return;

            const item = items[i];
            let lat = item.lat;
            let lng = item.lng;

            if (!lat || !lng) {
                if (this.locationCache[item.location]) {
                    lat = this.locationCache[item.location].lat;
                    lng = this.locationCache[item.location].lng;
                }
            }

            if (lat && lng) {
                this.addMarker(lat, lng, item, themeColor, bounds);
                continue;
            }

            loadingCallback(true, `正在搜尋地點座標 (${i + 1}/${items.length})...`);
            
            try {
                const coords = await this.geocode(item.location, signal);
                if (signal.aborted) return;
                if (coords) {
                    item.lat = coords.lat; 
                    item.lng = coords.lng;
                    this.locationCache[item.location] = coords; 
                    localStorage.setItem('myTripLocationCache', JSON.stringify(this.locationCache));
                    this.addMarker(coords.lat, coords.lng, item, themeColor, bounds);
                }
            } catch (err) {
                console.error("地址轉換失敗:", item.location, err);
            }

            if (!signal.aborted) {
                await new Promise(res => setTimeout(res, 350));
            }
        }

        if (!signal.aborted) {
            if (this.markers.length > 0) this.mapInstance.fitBounds(bounds);
            loadingCallback(false, '');
        }
    },

    addMarker(lat, lng, item, themeColor, bounds) {
        const location = new google.maps.LatLng(lat, lng);
        const marker = new google.maps.Marker({
            position: location, map: this.mapInstance, title: item.location,
            icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: themeColor, fillOpacity: 1, strokeColor: '#FAF6EB', strokeWeight: 2 }
        });
        const infoWindow = new google.maps.InfoWindow({ content: `<b>${item.location}</b><br><span style="font-size:10px; color:gray;">${item.category}</span>` });
        marker.addListener('click', () => { infoWindow.open(this.mapInstance, marker); });
        this.markers.push(marker);
        bounds.extend(location);
    },

    geocode(address, signal) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => reject('TIMEOUT'), 2000);
            
            const checkAbort = () => {
                if (signal.aborted) {
                    clearTimeout(timeoutId);
                    reject(new Error('ABORTED'));
                }
            };
            signal.addEventListener('abort', checkAbort);

            this.geocoder.geocode({ address }, (res, status) => {
                clearTimeout(timeoutId);
                signal.removeEventListener('abort', checkAbort);
                if (signal.aborted) {
                    reject(new Error('ABORTED'));
                    return;
                }
                if (status === 'OK' && res.length > 0) {
                    resolve({
                        lat: res[0].geometry.location.lat(),
                        lng: res[0].geometry.location.lng()
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }
};