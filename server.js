// bait-kakeibo/server.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({
    secret: 'bait-kakeibo-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // ローカル開発用
}));

// データファイルの初期化
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        users: [{ username: 'admin', password: 'admin', savings: 0, hourlyWage: 1100 }],
        expenses: [],
        shifts: []
    }, null, 2));
}

const readData = () => JSON.parse(fs.readFileSync(DATA_FILE));
const writeData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// ログインAPI
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const data = readData();
    const user = data.users.find(u => u.username === username && u.password === password);
    
    if (user) {
        req.session.username = username;
        res.json({ success: true, user: { username: user.username, savings: user.savings, hourlyWage: user.hourlyWage } });
    } else {
        res.status(401).json({ success: false, message: 'ユーザー名またはパスワードが違います' });
    }
});

// ログアウトAPI
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// データ取得API
app.get('/api/data', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const data = readData();
    const user = data.users.find(u => u.username === req.session.username);
    const userExpenses = data.expenses.filter(e => e.username === req.session.username);
    const userShifts = data.shifts.filter(s => s.username === req.session.username);
    
    res.json({
        savings: user.savings,
        hourlyWage: user.hourlyWage,
        expenses: userExpenses,
        shifts: userShifts
    });
});

// 支出追加API
app.post('/api/expense', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { amount, category, date, description } = req.body;
    const data = readData();
    const userIndex = data.users.findIndex(u => u.username === req.session.username);
    
    // 支出を記録
    const newExpense = {
        id: Date.now(),
        username: req.session.username,
        amount: parseInt(amount),
        category,
        date,
        description
    };
    data.expenses.push(newExpense);
    
    // 貯金を減らす
    data.users[userIndex].savings -= parseInt(amount);
    
    writeData(data);
    res.json({ success: true, savings: data.users[userIndex].savings });
});

// シフト（バイト）追加API
app.post('/api/shift', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { hours, date, hourlyWage } = req.body;
    const data = readData();
    const userIndex = data.users.findIndex(u => u.username === req.session.username);
    
    const wage = hourlyWage || data.users[userIndex].hourlyWage;
    const earnings = parseFloat(hours) * parseInt(wage);
    
    // シフトを記録
    const newShift = {
        id: Date.now(),
        username: req.session.username,
        hours: parseFloat(hours),
        earnings: earnings,
        date
    };
    data.shifts.push(newShift);
    
    // 貯金を増やす
    data.users[userIndex].savings += earnings;
    // 時給設定も更新（次回のため）
    data.users[userIndex].hourlyWage = parseInt(wage);
    
    writeData(data);
    res.json({ success: true, savings: data.users[userIndex].savings });
});

// 初期貯金設定API
app.post('/api/init-savings', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { amount } = req.body;
    const data = readData();
    const userIndex = data.users.findIndex(u => u.username === req.session.username);
    
    data.users[userIndex].savings = parseInt(amount);
    
    writeData(data);
    res.json({ success: true, savings: data.users[userIndex].savings });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
