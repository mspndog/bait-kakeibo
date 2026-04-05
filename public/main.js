// bait-kakeibo/public/main.js

// 画面要素
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');

// フォーム・ボタン
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');

const totalSavingsDisplay = document.getElementById('total-savings');
const historyList = document.getElementById('history-list');

// モーダル
const modals = {
    expense: document.getElementById('modal-expense'),
    income: document.getElementById('modal-income'),
    shift: document.getElementById('modal-shift'),
    init: document.getElementById('modal-init')
};

// --- ステート ---
let currentUser = null;
let appData = {
    savings: 0,
    hourlyWage: 1100,
    expenses: [],
    shifts: [],
    incomes: []
};

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    setDefaultDates();
});

function setupEventListeners() {
    loginBtn.onclick = login;
    logoutBtn.onclick = logout;

    // モーダル開閉
    document.getElementById('btn-add-expense').onclick = () => openModal('expense');
    document.getElementById('btn-add-income').onclick = () => openModal('income');
    document.getElementById('btn-add-shift').onclick = () => openModal('shift');
    document.getElementById('btn-set-init').onclick = () => openModal('init');

    document.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.onclick = closeModal;
    });

    // フォーム送信
    document.getElementById('submit-expense').onclick = submitExpense;
    document.getElementById('submit-income').onclick = submitIncome;
    document.getElementById('submit-shift').onclick = submitShift;
    document.getElementById('submit-init').onclick = submitInitSavings;

    // シフトプレビュー
    const shiftHours = document.getElementById('shift-hours');
    const shiftWage = document.getElementById('shift-wage');
    const preview = document.getElementById('salary-calc-preview');
    
    [shiftHours, shiftWage].forEach(el => {
        el.oninput = () => {
            const h = parseFloat(shiftHours.value) || 0;
            const w = parseInt(shiftWage.value) || 0;
            preview.textContent = `¥ ${(h * w).toLocaleString()}`;
        };
    });
}

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('expense-date').value = today;
    document.getElementById('income-date').value = today;
    document.getElementById('shift-date').value = today;
}

// --- 認証 ---
async function checkAuth() {
    try {
        const res = await fetch('/api/data');
        if (res.ok) {
            const data = await res.json();
            appData = data;
            showScreen('main');
            renderDashboard();
        } else {
            showScreen('login');
        }
    } catch (e) {
        showScreen('login');
    }
}

async function login() {
    const username = usernameInput.value;
    const password = passwordInput.value;
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await res.json();
        
        if (result.success) {
            loginError.textContent = '';
            checkAuth();
        } else {
            loginError.textContent = result.message;
        }
    } catch (e) {
        loginError.textContent = 'サーバーエラーが発生しました';
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    showScreen('login');
}

// --- データ処理 ---
async function submitExpense() {
    const amount = document.getElementById('expense-amount').value;
    const category = document.getElementById('expense-category').value;
    const date = document.getElementById('expense-date').value;
    const description = document.getElementById('expense-desc').value;

    if (!amount) return alert('金額を入力してください');

    const res = await fetch('/api/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, category, date, description })
    });

    if (res.ok) {
        closeModal();
        await checkAuth(); // 再取得して描画
    }
}

async function submitShift() {
    const hours = document.getElementById('shift-hours').value;
    const wage = document.getElementById('shift-wage').value;
    const date = document.getElementById('shift-date').value;

    if (!hours) return alert('時間を入力してください');

    const res = await fetch('/api/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours, date, hourlyWage: wage })
    });

    if (res.ok) {
        closeModal();
        await checkAuth();
    }
}

async function submitIncome() {
    const amount = document.getElementById('income-amount').value;
    const date = document.getElementById('income-date').value;
    const description = document.getElementById('income-desc').value;

    if (!amount) return alert('金額を入力してください');

    const res = await fetch('/api/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, date, description })
    });

    if (res.ok) {
        closeModal();
        await checkAuth();
    }
}

async function submitInitSavings() {
    const amount = document.getElementById('init-amount').value;
    if (!amount) return alert('金額を入力してください');

    const res = await fetch('/api/init-savings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
    });

    if (res.ok) {
        closeModal();
        await checkAuth();
    }
}

// --- UI更新 ---
function showScreen(screen) {
    loginScreen.classList.remove('active');
    mainScreen.classList.remove('active');
    
    if (screen === 'login') loginScreen.classList.add('active');
    else mainScreen.classList.add('active');
}

function renderDashboard() {
    totalSavingsDisplay.textContent = `¥ ${appData.savings.toLocaleString()}`;
    document.getElementById('shift-wage').value = appData.hourlyWage;
    
    // 履歴の統合とソート
    const history = [
        ...appData.expenses.map(e => ({ ...e, type: 'expense', title: e.category, sub: e.description })),
        ...appData.shifts.map(s => ({ ...s, type: 'income', title: 'バイト給与', sub: `${s.hours}時間勤務` })),
        ...(appData.incomes || []).map(i => ({ ...i, type: 'income', title: '臨時収入', sub: i.description }))
    ];
    
    history.sort((a, b) => new Date(b.date || b.id) - new Date(a.date || a.id));

    if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-msg">履歴はまだありません</p>';
        return;
    }

    historyList.innerHTML = history.slice(0, 10).map(item => `
        <div class="history-item">
            <div class="history-info">
                <span class="title">${item.title} ${item.sub ? `<small>(${item.sub})</small>` : ''}</span>
                <span class="date">${item.date || '日付不明'}</span>
            </div>
            <div class="history-amount ${item.type}">
                ${item.type === 'expense' ? '-' : '+'} ¥ ${(item.amount || item.earnings).toLocaleString()}
            </div>
        </div>
    `).join('');
}

// --- モーダルユーティリティ ---
function openModal(type) {
    modals[type].classList.add('active');
}

function closeModal() {
    Object.values(modals).forEach(m => m.classList.remove('active'));
}

window.onclick = (event) => {
    if (Object.values(modals).includes(event.target)) {
        closeModal();
    }
};
