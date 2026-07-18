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
     * @param {string} action - 權限動作名稱 (例如: 'canEditTrip', 'canAddUser')
     */
    can(action) {
        // 若為最高管理者，無條件放行
        if (this.permissions.isSuperAdmin) return true;
        
        return !!this.permissions[action];
    },

    // 取得所有權限狀態供 Vue 綁定
    getAllPermissions() {
        return this.permissions;
    }
};