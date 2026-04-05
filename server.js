// bait-kakeibo/server.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({
    secret: 'bait-kakeibo-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

const getInitialData = () => ({
    users: [{ username: 'admin', password: 'admin', cashBalance: 0, paypayBalance: 0, hourlyWage: 1100 }],
    expenses: [],
    shifts: [],
    incomes: []
});

// データファイルの初期化
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(getInitialData(), null, 2));
}

const readData = () => JSON.parse(fs.readFileSync(DATA_FILE));
const writeData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// ログインAPI
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const data = readData();
    const user = (data.users || []).find(u => 
        u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    
    console.log(`Login attempt: ${username}`);
    if (user) {
        req.session.username = user.username; // DBにある正しいケースで保存
        res.json({ success: true, user: { username: user.username } });
    } else {
        console.log(`Login failed for: ${username}`);
        res.status(401).json({ success: false, message: 'ログインに失敗しました。ユーザー名またはパスワードが間違っています。' });
    }
});

// 新規登録API
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'ユーザー名とパスワードを入力してください。' });
    }

    const data = readData();
    // すでに同じ名前のユーザーがいるかチェック
    const isExist = (data.users || []).some(u => u.username.toLowerCase() === username.toLowerCase());
    if (isExist) {
        return res.status(409).json({ success: false, message: 'このユーザー名はすでに使われています。別の名前を指定してください。' });
    }

    // 新規ユーザー追加
    const newUser = {
        username: username,
        password: password,
        cashBalance: 0,
        paypayBalance: 0,
        hourlyWage: 1100
    };
    if (!data.users) data.users = [];
    data.users.push(newUser);
    writeData(data);
    
    // そのままログイン状態にする
    console.log(`New user registered: ${username}`);
    req.session.username = username;
    res.json({ success: true, user: { username: newUser.username } });
});


// ログアウトAPI
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// リセットAPI
app.post('/api/reset', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    writeData(getInitialData());
    res.json({ success: true });
});

// データ取得API
app.get('/api/data', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const data = readData();
    const user = data.users.find(u => u.username === req.session.username);
    const userExpenses = data.expenses.filter(e => e.username === req.session.username);
    const userShifts = data.shifts.filter(s => s.username === req.session.username);
    const userIncomes = (data.incomes || []).filter(i => i.username === req.session.username);
    
    const pendingSalary = userShifts
        .filter(s => !s.paid)
        .reduce((sum, s) => sum + s.earnings, 0);

    res.json({
        cashBalance: user.cashBalance || 0,
        paypayBalance: user.paypayBalance || 0,
        hourlyWage: user.hourlyWage,
        expenses: userExpenses,
        shifts: userShifts,
        incomes: userIncomes,
        pendingSalary: pendingSalary
    });
});

// 支出追加API
app.post('/api/expense', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { amount, category, date, description, paymentMethod } = req.body;
    const data = readData();
    const userIndex = data.users.findIndex(u => u.username === req.session.username);
    
    const newExpense = {
        id: Date.now(),
        username: req.session.username,
        amount: parseInt(amount),
        category,
        date,
        description,
        paymentMethod // 'cash' | 'paypay'
    };
    data.expenses.push(newExpense);
    
    // 指定した支払い方法の残高を減らす
    if (paymentMethod === 'paypay') {
        data.users[userIndex].paypayBalance = (data.users[userIndex].paypayBalance || 0) - parseInt(amount);
    } else {
        data.users[userIndex].cashBalance = (data.users[userIndex].cashBalance || 0) - parseInt(amount);
    }
    
    writeData(data);
    res.json({ success: true });
});

// 収入追加API
app.post('/api/income', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { amount, date, description, paymentMethod } = req.body;
    const data = readData();
    const userIndex = data.users.findIndex(u => u.username === req.session.username);
    
    const newIncome = {
        id: Date.now(),
        username: req.session.username,
        amount: parseInt(amount),
        date,
        description,
        paymentMethod
    };
    data.incomes.push(newIncome);
    
    if (paymentMethod === 'paypay') {
        data.users[userIndex].paypayBalance += parseInt(amount);
    } else {
        data.users[userIndex].cashBalance += parseInt(amount);
    }
    
    writeData(data);
    res.json({ success: true });
});

// シフト追加API
app.post('/api/shift', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { hours, date, hourlyWage } = req.body;
    const data = readData();
    const userIndex = data.users.findIndex(u => u.username === req.session.username);
    
    const wage = hourlyWage || data.users[userIndex].hourlyWage;
    const earnings = parseFloat(hours) * parseInt(wage);
    
    const newShift = {
        id: Date.now(),
        username: req.session.username,
        hours: parseFloat(hours),
        earnings: earnings,
        date,
        paid: false
    };
    data.shifts.push(newShift);
    data.users[userIndex].hourlyWage = parseInt(wage);
    
    writeData(data);
    res.json({ success: true });
});

// 給与受取API
app.post('/api/collect-salary', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { paymentMethod } = req.body; // 受け取り先を指定可能にする
    const data = readData();
    const userIndex = data.users.findIndex(u => u.username === req.session.username);
    
    let totalCollected = 0;
    data.shifts.forEach(s => {
        if (s.username === req.session.username && !s.paid) {
            totalCollected += s.earnings;
            s.paid = true;
        }
    });
    
    if (paymentMethod === 'paypay') {
        data.users[userIndex].paypayBalance += totalCollected;
    } else {
        data.users[userIndex].cashBalance += totalCollected;
    }
    
    writeData(data);
    res.json({ success: true });
});

// 初期残高設定API
app.post('/api/init-savings', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { cashAmount, paypayAmount } = req.body;
    const data = readData();
    const userIndex = data.users.findIndex(u => u.username === req.session.username);
    
    data.users[userIndex].cashBalance = parseInt(cashAmount || 0);
    data.users[userIndex].paypayBalance = parseInt(paypayAmount || 0);
    
    writeData(data);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
