// js/permission.js
const PermissionManager = {
    permissions: {},

    /**
     * 讀取 GAS 管理權限表格
     * @param {string} gasUrl - GAS 應用程式網址
     * @param {string} username - 當前登入使用者帳號
     */
    async loadPermissions(gasUrl, username) {
        try {
            if (!gasUrl) return null;
            const data = await API.getUserPermissions(gasUrl, username);
            this.permissions = data || {};
            return this.permissions;
        } catch (error) {
            console.error('權限載入失敗:', error);
            return null;
        }
    },

    /**
     * 檢查是否具有特定權限
     * @param {string} action - 權限動作名稱 (例如: 'canManageDays', 'canSyncCloud')
     */
    can(action) {
        // 1. 若為超級管理員，無條件放行全部功能
        if (this.permissions.isSuperAdmin) return true;
        
        // 2. 針對後台有明確規範的權限節點，依照 JSON 傳回的 boolean 值為準
        if (typeof this.permissions[action] !== 'undefined') {
            return !!this.permissions[action];
        }
        
        // 3. 若是不受後台控管的純個人/一般操作 (未列在 9 大權限中)，預設全開
        return true;
    },

    // 取得所有權限狀態供 Vue 綁定
    getAllPermissions() {
        return this.permissions;
    }
};
