// js/auth.js
// 模組化：獨立處理帳號登入、註冊、登出與狀態檢查 (轉接 GAS)

// 解鎖畫面的 UI 處理
function unlockApp() {            
    const overlay = document.getElementById('lock-screen');
    if (overlay) {
        overlay.classList.add('opacity-0', 'pointer-events-none');
        overlay.style.transform = "scale(1.1)";
        setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('flex'); }, 400);
    }
}

// 嚴謹的輸入驗證邏輯
function validateAuthInputs(account, password) {
    // 限制 1 & 2: 只能是英文與數字，不可有空格或其他符號
    const accountRegex = /^[A-Za-z0-9]+$/;
    if (!account) return "請輸入帳號與密碼";
    if (!accountRegex.test(account)) return "帳號格式錯誤：僅限使用英文與數字，不可包含空格";
    
    // 限制 3: 密碼強制限定要 6 位數以上(包含 6 位數)
    if (!password) return "請輸入密碼";
    if (password.length < 6) return "密碼格式錯誤：長度必須至少 6 位數";
    
    return null; // 驗證通過
}

// 登入邏輯
async function handleFirebaseLogin() {
    const account = document.getElementById('fb-account').value;
    const password = document.getElementById('fb-password').value;
    const errorMsg = document.getElementById('fb-error-msg');
    
    // 執行嚴謹驗證
    const validationError = validateAuthInputs(account, password);
    if (validationError) {
        errorMsg.innerText = validationError; 
        errorMsg.style.opacity = '1';
        errorMsg.classList.remove('text-teal-400');
        errorMsg.classList.add('text-rose-400');
        return;
    }
    
    if(typeof showLoading === 'function') showLoading("登入驗證中...");
    
    try {
        const response = await callGasAuthAPI('login', { account, password });
        
        if (response.success) {
            // 從 GAS 收到的結構沒有 uid，我們自行組裝 user 物件
            const userObj = { uid: response.account, account: response.account };
            localStorage.setItem('userAuth', JSON.stringify(userObj));
            checkAuthState(userObj);
        } else {
            throw new Error(response.message);
        }
    } catch (error) {
        errorMsg.innerText = error.message; 
        errorMsg.style.opacity = '1';
        errorMsg.classList.remove('text-teal-400');
        errorMsg.classList.add('text-rose-400');
    } finally {
        if(typeof hideLoading === 'function') hideLoading();
    }
}
// 註冊邏輯
async function handleFirebaseRegister() {
    const account = document.getElementById('fb-account').value;
    const password = document.getElementById('fb-password').value;
    const errorMsg = document.getElementById('fb-error-msg');
    
    // 執行嚴謹驗證
    const validationError = validateAuthInputs(account, password);
    if (validationError) {
        errorMsg.innerText = validationError; 
        errorMsg.style.opacity = '1';
        errorMsg.classList.remove('text-teal-400');
        errorMsg.classList.add('text-rose-400');
        return;
    }
    
    if(typeof showLoading === 'function') showLoading("註冊資料建立中...");
    
    try {
        const response = await callGasAuthAPI('register', { account, password });
        
        if (response.success) {
            // 註冊成功：清空密碼欄位並要求使用者重新登入
            document.getElementById('fb-password').value = '';
            errorMsg.innerText = response.message;
            errorMsg.style.opacity = '1';
            errorMsg.classList.remove('text-rose-400');
            errorMsg.classList.add('text-teal-400');
        } else {
            throw new Error(response.message);
        }
    } catch (error) {
        errorMsg.innerText = error.message;
        errorMsg.style.opacity = '1';
        errorMsg.classList.remove('text-teal-400');
        errorMsg.classList.add('text-rose-400');
    } finally {
        if(typeof hideLoading === 'function') hideLoading();
    }
}

async function handleFirebaseLogout() {
    if(confirm('確定要登出系統並返回登入畫面嗎？')) {
        try {
            localStorage.removeItem('userAuth');
            window.location.href = window.location.origin + window.location.pathname;
        } catch (e) {
            alert("登出失敗：" + e.message);
        }
    }
}

async function checkAuthState(user) {
    if (user) {
        if (window.vueAppInstance) {
            window.vueAppInstance.currentUserUid = user.uid || user.account;
        }
        
        try {
            // 向 GAS 請求真實權限
            const perms = await callGasAuthAPI('getPermissions', { account: user.account });
            
            if (window.vueAppInstance) {
                // 將真實的權限寫入 Vue 實體
                window.vueAppInstance.isSuperAdmin = perms.isSuperAdmin === true;
                window.vueAppInstance.isTravelMaster = perms.isSuperAdmin === true;
                window.vueAppInstance.isTravelGuest = perms.isSuperAdmin !== true;
                
                // 動態掛載詳細權限到全域變數，供 checkPermission 函式呼叫
                window.userPermissions = perms;
            }
        } catch (error) {
            console.error("雲端權限驗證失敗：", error);
            if (window.vueAppInstance) {
                window.vueAppInstance.isTravelMaster = false;
                window.vueAppInstance.isTravelGuest = true;
                window.userPermissions = null;
            }
        } finally {
            unlockApp();
        }
    } else {
        if (window.vueAppInstance) {
            window.vueAppInstance.currentUserUid = null;
            window.vueAppInstance.isTravelMaster = false;
            window.vueAppInstance.isTravelGuest = true;
            window.vueAppInstance.detectedCloudTrips = [];
            window.userPermissions = null;
        }
    }
}

// 實際呼叫 GAS API
async function callGasAuthAPI(action, data) {
    // 支援從設定檔讀取，或是從 UI 中輸入後存在 vue 或 localStorage 的網址
    const gasUrl = CONFIG.GAS_URL || (window.vueAppInstance && window.vueAppInstance.gasUrl) || localStorage.getItem('gasUrl');
    
    if (!gasUrl || gasUrl.trim() === '') {
        throw new Error("系統尚未綁定 GAS 網址，請先至設定或 config.js 中填寫");
    }

    try {
        const payload = { action: action, ...data };
        
        const response = await fetch(gasUrl, {
            method: 'POST',
            // 使用 text/plain 避免跨域 preflight (CORS OPTIONS) 阻擋
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (result.success) {
            return result.data;
        } else {
            throw new Error(result.error || "GAS 處理發生錯誤");
        }
    } catch (error) {
        console.error("API 呼叫失敗:", error);
        throw new Error(error.message || "網路連線異常，請確認 GAS 網址是否正確");
    }
}

window.addEventListener('load', () => {
    setTimeout(() => {
        const storedUser = localStorage.getItem('userAuth');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                checkAuthState(user);
            } catch(e) {
                console.error("解析登入狀態失敗", e);
                checkAuthState(null);
            }
        } else {
            checkAuthState(null);
        }
    }, 500); 
});


