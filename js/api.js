// js/api.js
const API = {
    async saveToCloud(gasUrl, sheetName, dataStr) {
        // 後端從 e.parameter.action 讀取路由，因此將 action 附加於 URL
        const url = gasUrl.includes('?') ? `${gasUrl}&action=saveProject` : `${gasUrl}?action=saveProject`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ projectName: sheetName, projectData: dataStr }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    },

    async archiveToCloud(gasUrl, sheetName) {
        const url = gasUrl.includes('?') ? `${gasUrl}&action=archiveProject` : `${gasUrl}?action=archiveProject`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ projectName: sheetName }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || '封存失敗');
        return result;
    },

    // 注意：配合後端動態查驗權限過濾封存專案，原 isAdmin 參數改為傳遞帳號 account
    async fetchCloudList(gasUrl, account) {
        const url = gasUrl.includes('?') ? `${gasUrl}&action=getProjectList` : `${gasUrl}?action=getProjectList`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ account: account }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        // 後端回傳目錄陣列格式於 result.data 中
        if (!result.success || !result.data) throw new Error(result.error || '無法讀取目錄，請確認網址或權限');
        return result.data;
    },

    async loadSelectedCloudTrip(gasUrl, sheetName) {
        const url = gasUrl.includes('?') ? `${gasUrl}&action=loadProject` : `${gasUrl}?action=loadProject`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ projectName: sheetName }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        if (!result.success || !result.data) throw new Error(result.error || '讀取資料失敗');
        // 後端統一回傳資料於 result.data
        return result.data;
    },

    async getUserPermissions(gasUrl, username) {
        const url = gasUrl.includes('?') ? `${gasUrl}&action=getPermissions` : `${gasUrl}?action=getPermissions`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ account: username }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || '無法取得權限設定');
        // 後端回傳權限 JSON 於 result.data 中
        return result.data;
    },

    async createNewProject(gasUrl, newProjectName) {
        // 後端的 saveProject 已包含找不到工作頁即自動建立的功能，直接對接 saveProject 路由
        const url = gasUrl.includes('?') ? `${gasUrl}&action=saveProject` : `${gasUrl}?action=saveProject`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ projectName: newProjectName, projectData: "{}" }), // 給予初始空資料
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || '建立專案失敗');
        return result;
    },

    // 新增：解開封存專案
    async unarchiveToCloud(gasUrl, sheetName) {
        const url = gasUrl.includes('?') ? `${gasUrl}&action=unarchiveProject` : `${gasUrl}?action=unarchiveProject`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ projectName: sheetName }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || '解開封存失敗');
        return result.data;
    },

    // 新增：寫入歷史軌跡
    async logHistory(gasUrl, user, projectName, actionName, details) {
        const url = gasUrl.includes('?') ? `${gasUrl}&action=logAction` : `${gasUrl}?action=logAction`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ 
                user: user, 
                projectName: projectName, 
                actionName: actionName, 
                details: details 
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || '歷史軌跡寫入失敗');
        return result.data;
    }
};
