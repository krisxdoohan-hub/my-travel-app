// js/modules/record.js
// 歷史軌跡管理模組：負責將所有新增、修改、刪除的動作紀錄推送至 GAS

window.RecordManager = {
    /**
     * 記錄歷史軌跡
     * @param {string} action - 動作名稱 (例如：'新增行程', '刪除待辦', '修改權限')
     * @param {object} details - 詳細資料的 JSON 物件
     */
    logAction: async function(action, details = {}) {
        try {
            // 取得目前環境的專案與使用者資訊
            const tripTitle = (typeof vueAppInstance !== 'undefined' && vueAppInstance.tripTitle) 
                              ? vueAppInstance.tripTitle : '未命名專案';
            
            // 嘗試取得當前登入帳號 (根據 auth.js 或全域變數)
            const currentUser = (window.AuthManager && window.AuthManager.currentUser) 
                              ? window.AuthManager.currentUser : '尚未登入使用者';

            // 組裝軌跡資料
            const logData = {
                timestamp: new Date().toISOString(),
                user: currentUser,
                tripTitle: tripTitle,
                action: action,
                details: JSON.stringify(details)
            };

            console.log('[歷史軌跡] 準備紀錄:', logData);

            // 若本機開發環境無法使用 fetch，直接印出 Log 即可，不阻塞 UI
            if (window.location.protocol === 'file:') {
                console.info('[歷史軌跡] 本機開發環境 (file://)，僅輸出日誌不發送請求。');
                return;
            }

            // 呼叫共用的 API 模組發送資料至 GAS
            // 假設 js/api.js 之後會統一定義 window.API.sendRequest
            if (window.API && typeof window.API.sendRequest === 'function') {
                // 將資料背景推播至 GAS (不 await 阻擋畫面)
                window.API.sendRequest('logHistory', logData).catch(e => {
                    console.warn('[歷史軌跡] GAS API 發送失敗:', e);
                });
            } else if (window.CONFIG && window.CONFIG.GAS_URL) {
                // 若 API 模組尚未準備好，以最基本的 fetch 進行發送
                fetch(window.CONFIG.GAS_URL + "?action=logHistory", {
                    method: 'POST',
                    mode: 'no-cors', // 避免跨域報錯阻擋程式
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(logData)
                }).catch(e => console.warn('[歷史軌跡] 發送失敗:', e));
            }

        } catch (error) {
            console.error('[歷史軌跡] 發生未預期錯誤:', error);
        }
    }
};