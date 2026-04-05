// bait-kakeibo/public/main.js

let appData = {
    cashBalance: 0,
    paypayBalance: 0,
    hourlyWage: 1100,
    expenses: [],
    shifts: [],
    incomes: [],
    pendingSalary: 0
};

let currentYear, currentMonth;
let expenseChart, incomeChart;

document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    // 認証タブトグル
    document.getElementById('tab-login').onclick = () => toggleAuthMode('login');
    document.getElementById('tab-register').onclick = () => toggleAuthMode('register');

    // 認証アクション
    document.getElementById('login-btn').onclick = login;
    document.getElementById('register-btn').onclick = register;
    document.getElementById('password').onkeydown = (e) => { 
        if (e.key === 'Enter') {
            document.getElementById('login-btn').classList.contains('hidden') ? register() : login();
        } 
    };
    document.getElementById('logout-btn').onclick = logout;
    document.getElementById('btn-reset').onclick = resetData;

    // アクション
    document.getElementById('btn-add-expense').onclick = () => openActionModal('expense');
    document.getElementById('btn-add-income').onclick = () => openActionModal('income');
    document.getElementById('btn-add-shift').onclick = () => openActionModal('shift');
    document.getElementById('btn-set-init').onclick = () => openActionModal('init');
    document.getElementById('btn-collect-salary').onclick = () => document.getElementById('modal-collect').classList.add('active');

    // カレンダー
    document.getElementById('prev-month').onclick = () => changeMonth(-1);
    document.getElementById('next-month').onclick = () => changeMonth(1);

    // モーダル
    document.querySelectorAll('.btn-close').forEach(btn => btn.onclick = closeModals);
    document.getElementById('modal-submit-btn').onclick = handleModalSubmit;
    document.getElementById('submit-collect').onclick = handleCollectSalary;
}

// --- 認証 ---
async function checkAuth() {
    try {
        const res = await fetch('/api/data');
        if (res.ok) {
            appData = await res.json();
            showScreen('main');
            renderDashboard();
        } else {
            showScreen('login');
        }
    } catch (e) { showScreen('login'); }
}

async function login() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const err = document.getElementById('login-error');
    err.textContent = 'ログイン中...';
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const result = await res.json();
        if (res.ok) {
            checkAuth();
        } else {
            err.textContent = result.message || 'ログインに失敗しました';
        }
    } catch (e) {
        console.error(e);
        err.textContent = 'サーバーに接続できません。';
    }
}

async function register() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const err = document.getElementById('login-error');
    err.textContent = '登録中...';
    
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const result = await res.json();
        if (res.ok) {
            checkAuth();
        } else {
            err.textContent = result.message || '登録に失敗しました';
        }
    } catch (e) {
        console.error(e);
        err.textContent = 'サーバーに接続できません。';
    }
}

function toggleAuthMode(mode) {
    const tLogin = document.getElementById('tab-login');
    const tReg = document.getElementById('tab-register');
    const bLogin = document.getElementById('login-btn');
    const bReg = document.getElementById('register-btn');
    document.getElementById('login-error').textContent = '';

    if (mode === 'login') {
        tLogin.classList.add('active');
        tReg.classList.remove('active');
        bLogin.classList.remove('hidden');
        bReg.classList.add('hidden');
    } else {
        tLogin.classList.remove('active');
        tReg.classList.add('active');
        bLogin.classList.add('hidden');
        bReg.classList.remove('hidden');
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    location.reload();
}

async function resetData() {
    if (!confirm('全てのデータを消去し、リセットしますか？')) return;
    await fetch('/api/reset', { method: 'POST' });
    checkAuth();
}

function showScreen(screen) {
    const l = document.getElementById('login-screen');
    const m = document.getElementById('main-screen');
    if (screen === 'main') {
        l.classList.remove('active');
        m.classList.add('active');
        // アニメーションのリセット（再ログイン時）
        document.querySelectorAll('.reveal-item').forEach(el => {
            el.style.animation = 'none';
            el.offsetHeight; /* reflow */
            el.style.animation = '';
        });
    } else {
        l.classList.add('active');
        m.classList.remove('active');
    }
}

// --- ダッシュボード描画 ---
function renderDashboard() {
    document.getElementById('cash-balance').textContent = `¥ ${appData.cashBalance.toLocaleString()}`;
    document.getElementById('paypay-balance').textContent = `¥ ${appData.paypayBalance.toLocaleString()}`;
    document.getElementById('pending-salary-value').textContent = `¥ ${appData.pendingSalary.toLocaleString()}`;
    document.getElementById('user-display').textContent = `admin`;

    const collectBtn = document.getElementById('btn-collect-salary');
    if (appData.pendingSalary > 0) collectBtn.classList.remove('hidden');
    else collectBtn.classList.add('hidden');

    updateCharts();
    renderCalendar();
}

function updateCharts() {
    const exCtx = document.getElementById('expense-chart').getContext('2d');
    const inCtx = document.getElementById('income-chart').getContext('2d');

    const expData = { '食費': 0, '日用品': 0, '衣服': 0, '美容': 0, '遊び': 0, 'その他': 0 };
    appData.expenses.forEach(e => { if (expData[e.category] !== undefined) expData[e.category] += e.amount; });

    const incData = { 'お小遣い等': 0, 'バイト代': 0 };
    appData.incomes.forEach(i => incData['お小遣い等'] += i.amount);
    appData.shifts.forEach(s => incData['バイト代'] += s.earnings);

    if (expenseChart) expenseChart.destroy();
    expenseChart = new Chart(exCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(expData),
            datasets: [{ data: Object.values(expData), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#94a3b8'] }]
        },
        options: { plugins: { legend: { display: false } }, cutout: '75%', maintainAspectRatio: false }
    });

    if (incomeChart) incomeChart.destroy();
    incomeChart = new Chart(inCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(incData),
            datasets: [{ data: Object.values(incData), backgroundColor: ['#6366f1', '#fbbf24'] }]
        },
        options: { plugins: { legend: { display: false } }, cutout: '75%', maintainAspectRatio: false }
    });
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const dateObj = new Date(currentYear, currentMonth);
    document.getElementById('current-month-display').textContent = `${currentYear}.${String(currentMonth + 1).padStart(2, '0')}`;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const days = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));

    for (let d = 1; d <= days; d++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        const dayExp = appData.expenses.filter(e => e.date === dateStr).reduce((s, e) => s + e.amount, 0);
        const dayInc = appData.incomes.filter(i => i.date === dateStr).reduce((s, i) => s + i.amount, 0);
        const daySh = appData.shifts.filter(s => s.date === dateStr).reduce((s, s_obj) => s + s_obj.earnings, 0);

        cell.innerHTML = d;
        if (dayExp > 0) {
            cell.classList.add('has-data');
            cell.innerHTML += `<span class="sum-expense">-¥${dayExp.toLocaleString()}</span>`;
        }
        if (dayInc + daySh > 0) cell.classList.add('has-data');

        cell.onclick = () => showDayDetail(dateStr);
        grid.appendChild(cell);
    }
}

function changeMonth(diff) {
    currentMonth += diff;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    else if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
}

// --- モーダル ---
let currentAction = '';
function openActionModal(type) {
    currentAction = type;
    const b = document.getElementById('modal-body');
    const t = document.getElementById('modal-title');
    const today = new Date().toISOString().split('T')[0];
    let html = '';

    if (type === 'expense') {
        t.textContent = '💸 支出を入力';
        html = `
            <div class="input-group"><label>金額</label><input type="number" id="m-amount" placeholder="0"></div>
            <div class="input-group"><label>項目</label><select id="m-cat"><option>食費</option><option>日用品</option><option>衣服</option><option>美容</option><option>遊び</option><option>その他</option></select></div>
            <div class="input-group"><label>日付</label><input type="date" id="m-date" value="${today}"></div>
            <div class="payment-selection"><label class="payment-option"><input type="radio" name="m-pm" value="cash" checked><span>現金</span></label><label class="payment-option"><input type="radio" name="m-pm" value="paypay"><span>PayPay</span></label></div>
        `;
    } else if (type === 'income') {
        t.textContent = '🎁 収入を入力';
        html = `
            <div class="input-group"><label>金額</label><input type="number" id="m-amount" placeholder="0"></div>
            <div class="input-group"><label>日付</label><input type="date" id="m-date" value="${today}"></div>
            <div class="input-group"><label>メモ</label><input type="text" id="m-desc"></div>
            <div class="payment-selection"><label class="payment-option"><input type="radio" name="m-pm" value="cash" checked><span>現金</span></label><label class="payment-option"><input type="radio" name="m-pm" value="paypay"><span>PayPay</span></label></div>
        `;
    } else if (type === 'shift') {
        t.textContent = '🕒 シフト追加';
        html = `
            <div class="input-group"><label>勤務時間(h)</label><input type="number" id="m-hours" step="0.1"></div>
            <div class="input-group"><label>日付</label><input type="date" id="m-date" value="${today}"></div>
        `;
    } else if (type === 'init') {
        t.textContent = '💰 残高修正';
        html = `
            <div class="input-group"><label>現金</label><input type="number" id="m-cash" value="${appData.cashBalance}"></div>
            <div class="input-group"><label>PayPay</label><input type="number" id="m-paypay" value="${appData.paypayBalance}"></div>
        `;
    }

    b.innerHTML = html;
    document.getElementById('modal-container').classList.add('active');
}

async function handleModalSubmit() {
    let url = '', body = {};
    const d = document.getElementById('m-date')?.value;
    const pm = document.querySelector('input[name="m-pm"]:checked')?.value;

    if (currentAction === 'expense') {
        url = '/api/expense';
        body = { amount: document.getElementById('m-amount').value, category: document.getElementById('m-cat').value, date: d, paymentMethod: pm, description: '' };
    } else if (currentAction === 'income') {
        url = '/api/income';
        body = { amount: document.getElementById('m-amount').value, date: d, paymentMethod: pm, description: document.getElementById('m-desc').value };
    } else if (currentAction === 'shift') {
        url = '/api/shift';
        body = { hours: document.getElementById('m-hours').value, date: d, hourlyWage: appData.hourlyWage };
    } else if (currentAction === 'init') {
        url = '/api/init-savings';
        body = { cashAmount: document.getElementById('m-cash').value, paypayAmount: document.getElementById('m-paypay').value };
    }

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) { closeModals(); checkAuth(); }
}

async function handleCollectSalary() {
    const pm = document.querySelector('input[name="collect-method"]:checked').value;
    const res = await fetch('/api/collect-salary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethod: pm }) });
    if (res.ok) { closeModals(); checkAuth(); }
}

function closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); }

function showDayDetail(date) {
    const exps = appData.expenses.filter(e => e.date === date);
    const incs = appData.incomes.filter(i => i.date === date);
    const shifts = appData.shifts.filter(s => s.date === date);
    if (!exps.length && !incs.length && !shifts.length) return;

    let msg = `${date} の記録:\n\n`;
    exps.forEach(e => msg += `・支出 ${e.category}: ¥${e.amount.toLocaleString()} (${e.paymentMethod})\n`);
    incs.forEach(i => msg += `・収入 ${i.description}: ¥${i.amount.toLocaleString()} (${i.paymentMethod})\n`);
    shifts.forEach(s => msg += `・バイト ${s.hours}h: ¥${s.earnings.toLocaleString()}\n`);
    alert(msg);
}
