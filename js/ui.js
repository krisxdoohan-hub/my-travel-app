// js/ui.js
const UI = {
    showLoading(text) { 
        const textEl = document.getElementById('loading-text');
        const overlayEl = document.getElementById('loading-overlay');
        if(textEl) textEl.innerText = text; 
        if(overlayEl) overlayEl.classList.replace('hidden', 'flex'); 
    },
    hideLoading() { 
        const overlayEl = document.getElementById('loading-overlay');
        if(overlayEl) overlayEl.classList.replace('flex', 'hidden'); 
    }
};

// 為了相容 HTML 中可能寫死的全域呼叫，保留全域指標
window.showLoading = UI.showLoading;
window.hideLoading = UI.hideLoading;