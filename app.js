// QR Hub - Core JavaScript Logic (Dynamic & Modular)
let qrData = [];
let activeTab = 'personal';
let searchKeyword = '';
let activeBankFilter = 'Tất cả';
let currentSelectedQR = null; // Store currently selected QR item in modal

// DOM Elements
const personalGrid = document.getElementById('personalGrid');
const groupGrid = document.getElementById('groupGrid');
const tabPersonal = document.getElementById('tabPersonal');
const tabGroup = document.getElementById('tabGroup');
const searchInput = document.getElementById('searchInput');
const bankFiltersContainer = document.getElementById('bankFilters');

// Modal Elements
const modal = document.getElementById('qrModal');
const modalContent = document.getElementById('modalContent');
const modalName = document.getElementById('modalName');
const modalBank = document.getElementById('modalBank');
const modalAccount = document.getElementById('modalAccount');
const modalQR = document.getElementById('modalQR');
const btnDownloadQR = document.getElementById('btnDownloadQR');
const btnCopyModal = document.getElementById('btnCopyModal');

// Init application on load
window.addEventListener('DOMContentLoaded', () => {
    // Hide modal on start
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    
    fetchData();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Search input instant search
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchKeyword = e.target.value;
            renderAll();
        });
    }

    // Modal click outside to close
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                closeQRModal();
            }
        });
    }

    // Escape key press to close modal
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeQRModal();
        }
    });

    // Modal Copy button
    if (btnCopyModal) {
        btnCopyModal.addEventListener('click', () => {
            if (currentSelectedQR) {
                copyToClipboard(currentSelectedQR.accountNumber, btnCopyModal);
            }
        });
    }

    // Modal Download button
    if (btnDownloadQR) {
        btnDownloadQR.addEventListener('click', () => {
            if (currentSelectedQR) {
                downloadQRImage(currentSelectedQR.qrImage, `${currentSelectedQR.owner}_${currentSelectedQR.bank}.png`);
            }
        });
    }
}

// Fetch data from data.json
async function fetchData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        qrData = await response.json();
        
        // Group and sort data alphabetically by Vietnamese Owner Name
        sortQRData();
        
        // Generate filters dynamically based on fetched bank names
        generateBankFilters();
        
        // Initial render
        renderAll();
    } catch (error) {
        console.error('Failed to load QR database:', error);
        showToast('Không thể tải cơ sở dữ liệu QR. Vui lòng kiểm tra lại!');
    }
}

// Sort data alphabetically by owner name (using Vietnamese locale rules)
function sortQRData() {
    qrData.sort((a, b) => {
        // Use Vietnamese localeCompare for correct alphabetical order
        return a.owner.localeCompare(b.owner, 'vi', { sensitivity: 'accent' });
    });
}

// Dynamic Bank filter generation
function generateBankFilters() {
    if (!bankFiltersContainer) return;
    
    // Extract unique banks from data
    const banks = new Set();
    qrData.forEach(item => {
        if (item.bank) banks.add(item.bank);
    });
    
    const sortedBanks = Array.from(banks).sort((a, b) => a.localeCompare(b, 'vi'));
    
    // Clear and add "Tất cả" plus bank options
    bankFiltersContainer.innerHTML = '';
    
    const allFilters = ['Tất cả', ...sortedBanks];
    
    allFilters.forEach(bank => {
        const btn = document.createElement('button');
        btn.innerText = bank;
        btn.className = getFilterButtonClass(bank === activeBankFilter);
        btn.addEventListener('click', () => {
            activeBankFilter = bank;
            // Update UI styles of all filter buttons
            Array.from(bankFiltersContainer.children).forEach(child => {
                child.className = getFilterButtonClass(child.innerText === activeBankFilter);
            });
            renderAll();
        });
        bankFiltersContainer.appendChild(btn);
    });
}

// Helper to get button Tailwind classes based on active state
function getFilterButtonClass(isActive) {
    if (isActive) {
        return 'px-4 py-2 rounded-full bg-primary text-on-primary font-label-md text-label-sm transition-all shadow-sm cursor-pointer';
    } else {
        return 'px-4 py-2 rounded-full bg-white border border-slate-200 text-on-surface-variant hover:bg-primary/5 hover:text-primary font-label-md text-label-sm transition-all shadow-sm cursor-pointer';
    }
}

// Global switch tab action
function switchTab(type) {
    activeTab = type;
    
    if (activeTab === 'personal') {
        personalGrid.classList.remove('hidden');
        groupGrid.classList.add('hidden');
        tabPersonal.classList.add('tab-active');
        tabPersonal.classList.remove('text-on-surface-variant');
        tabGroup.classList.remove('tab-active');
        tabGroup.classList.add('text-on-surface-variant');
    } else {
        personalGrid.classList.add('hidden');
        groupGrid.classList.remove('hidden');
        tabGroup.classList.add('tab-active');
        tabGroup.classList.remove('text-on-surface-variant');
        tabPersonal.classList.remove('tab-active');
        tabPersonal.classList.add('text-on-surface-variant');
    }
    
    renderAll();
}

// Normalization function to clean and strip accents for smart search
function normalizeStr(str) {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/đ/g, 'd')
        .replace(/\s+/g, ''); // strip spaces
}

// Render both personal and group grids based on current state (tab, search, filter)
function renderAll() {
    // Clear grids
    personalGrid.innerHTML = '';
    groupGrid.innerHTML = '';
    
    // Normalize keywords for robust matching
    const searchNormalized = normalizeStr(searchKeyword);
    
    // Filter active items
    const filteredItems = qrData.filter(item => {
        // Filter by tab
        if (item.type !== activeTab) return false;
        
        // Filter by bank
        if (activeBankFilter !== 'Tất cả' && item.bank !== activeBankFilter) return false;
        
        // Filter by search keyword (owner or account number)
        if (searchKeyword.trim() !== '') {
            const ownerNormalized = normalizeStr(item.owner);
            const accountNormalized = normalizeStr(item.accountNumber);
            const bankNormalized = normalizeStr(item.bank);
            
            const isMatch = ownerNormalized.includes(searchNormalized) || 
                            accountNormalized.includes(searchNormalized) ||
                            bankNormalized.includes(searchNormalized);
                            
            if (!isMatch) return false;
        }
        
        return true;
    });
    
    const targetGrid = activeTab === 'personal' ? personalGrid : groupGrid;
    
    if (filteredItems.length === 0) {
        // Render "No results" visual placeholder
        targetGrid.className = 'col-span-full py-16 flex flex-col items-center justify-center text-center';
        targetGrid.innerHTML = `
            <div class="bg-white/50 backdrop-blur-md border border-slate-100 rounded-3xl p-8 max-w-sm shadow-sm flex flex-col items-center">
                <span class="material-symbols-outlined text-outline text-5xl mb-4 text-slate-400">search_off</span>
                <h4 class="font-headline-md text-on-surface font-semibold mb-2">Không tìm thấy QR nào</h4>
                <p class="font-body-md text-on-surface-variant text-sm">Vui lòng thử lại với từ khóa hoặc ngân hàng khác.</p>
            </div>
        `;
    } else {
        // Reset grid structure if it was changed to centered column layout
        targetGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-card-gap';
        
        filteredItems.forEach(item => {
            const card = createQRCard(item);
            targetGrid.appendChild(card);
        });
    }
}

// HTML Card Generator
function createQRCard(item) {
    const isGroup = item.type === 'group';
    const cardDiv = document.createElement('div');
    cardDiv.className = `glass-card rounded-[24px] p-8 group cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl flex flex-col justify-between ${
        isGroup ? 'border-t-4 border-t-secondary-container' : ''
    }`;
    
    // Set card click handler to open modal (except when clicking on copy button)
    cardDiv.addEventListener('click', () => {
        openQRModal(item);
    });
    
    cardDiv.innerHTML = `
        <div class="flex flex-col gap-6 w-full">
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2 text-primary">
                    <span class="material-symbols-outlined text-headline-md">${isGroup ? 'group' : 'account_balance'}</span>
                    <span class="font-label-md text-label-md font-bold uppercase tracking-wider">${item.bank}</span>
                </div>
                <h3 class="font-headline-md text-headline-md text-on-surface font-bold line-clamp-1">${item.owner}</h3>
            </div>
            <div class="bg-white rounded-xl p-4 border border-outline-variant/30 shadow-sm flex items-center justify-center aspect-square overflow-hidden qr-inset">
                <img alt="QR Code" class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" src="${item.qrImage}" loading="lazy">
            </div>
            <div class="flex items-center justify-between pt-4 border-t border-outline-variant/30">
                <div class="flex flex-col">
                    <span class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Số tài khoản</span>
                    <span class="font-body-md text-body-md font-mono font-semibold text-on-surface">${item.accountNumber}</span>
                </div>
                <button class="material-symbols-outlined text-primary p-2 hover:bg-primary/5 rounded-lg transition-all btn-copy" title="Sao chép số tài khoản">content_copy</button>
            </div>
        </div>
    `;
    
    // Attach click listener for copying to avoid card opening modal
    const copyBtn = cardDiv.querySelector('.btn-copy');
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(item.accountNumber, copyBtn);
    });
    
    return cardDiv;
}

// Modal open with transition
function openQRModal(item) {
    currentSelectedQR = item;
    
    modalName.innerText = item.owner;
    modalBank.innerText = item.bank;
    modalAccount.innerText = item.accountNumber;
    modalQR.src = item.qrImage;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Add micro-interaction transition
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}

// Modal close with transition
function closeQRModal() {
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        currentSelectedQR = null;
    }, 300);
}

// Copy account number helper
function copyToClipboard(text, buttonElement) {
    // Strip space characters before copying
    const plainText = text.replace(/\s+/g, '');
    
    navigator.clipboard.writeText(plainText).then(() => {
        showToast('Đã sao chép số tài khoản vào bộ nhớ tạm!');
        
        // Visual button feedback
        if (buttonElement) {
            const originalIcon = buttonElement.innerText;
            buttonElement.innerText = 'done';
            buttonElement.classList.add('text-secondary');
            
            setTimeout(() => {
                buttonElement.innerText = originalIcon;
                buttonElement.classList.remove('text-secondary');
            }, 1500);
        }
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Sao chép thất bại. Vui lòng sao chép thủ công!');
    });
}

// Download QR image safely with CORS handling
async function downloadQRImage(url, filename) {
    showToast('Đang chuẩn bị tải mã QR...');
    try {
        // Fetch image as blob
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error('Network error');
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        window.URL.revokeObjectURL(blobUrl);
        showToast('Đã tải mã QR thành công!');
    } catch (error) {
        console.warn('CORS blocking direct download, attempting fallback', error);
        
        // Fallback: Open image in a new tab with download instructions
        try {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('Đã mở ảnh trong tab mới. Hãy nhấn chuột phải chọn "Lưu hình ảnh thành..."');
        } catch (fbErr) {
            console.error('Fallback failed:', fbErr);
            showToast('Không thể tải ảnh. Vui lòng bấm chuột phải vào ảnh và chọn lưu!');
        }
    }
}

// Custom Toast notification UI element
function showToast(message) {
    // Clear any existing toasts to avoid stacking clutter
    const oldToasts = document.querySelectorAll('.custom-toast');
    oldToasts.forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = 'custom-toast fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl transition-all duration-300 transform translate-y-10 opacity-0 z-[100] font-label-md text-sm flex items-center gap-3 border border-slate-800';
    toast.innerHTML = `
        <span class="material-symbols-outlined text-[#6cf8bb]">info</span>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    // Slide and fade in
    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);
    
    // Auto-remove after 2.5s
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 2500);
}
