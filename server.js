// bait-kakeibo/server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// URLが.envから読み込めない場合は、以下のURLを直接使いますが、本番環境(Render)では設定(Environment Variables)を使うのが安全です。
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://mspn:R4e1i7ji@cluster0.sylcl4f.mongodb.net/?appName=Cluster0";

// MongoDBに接続
mongoose.connect(MONGODB_URI).then(() => console.log('MongoDB Connected!'))
  .catch(err => console.error('MongoDB Connection Error:', err));

app.use(bodyParser.json());
app.use(express.static('public'));

// ログイン状態（セッション）もMongoDBに保存して、Render再起動でログアウトされないようにする
app.use(session({
    secret: 'bait-kakeibo-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGODB_URI }),
    cookie: { secure: false } 
}));

/* =======================================================
   Mongoose Schemas (データベースの設計図)
======================================================= */
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    cashBalance: { type: Number, default: 0 },
    paypayBalance: { type: Number, default: 0 },
    hourlyWage: { type: Number, default: 1100 }
});
const User = mongoose.model('User', userSchema);

const expenseSchema = new mongoose.Schema({
    username: String,
    amount: Number,
    category: String,
    date: String,
    description: String,
    paymentMethod: String
});
const Expense = mongoose.model('Expense', expenseSchema);

const incomeSchema = new mongoose.Schema({
    username: String,
    amount: Number,
    date: String,
    description: String,
    paymentMethod: String
});
const Income = mongoose.model('Income', incomeSchema);

const shiftSchema = new mongoose.Schema({
    username: String,
    hours: Number,
    earnings: Number,
    date: String,
    paid: { type: Boolean, default: false }
});
const Shift = mongoose.model('Shift', shiftSchema);

/* =======================================================
   API Routes
======================================================= */

// ログインAPI
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") }, password: password });
        console.log(`Login attempt: ${username}`);
        if (user) {
            req.session.username = user.username;
            res.json({ success: true, user: { username: user.username } });
        } else {
            console.log(`Login failed for: ${username}`);
            res.status(401).json({ success: false, message: 'ログインに失敗しました。ユーザー名またはパスワードが間違っています。' });
        }
    } catch(e) { 
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' }); 
    }
});

// 新規登録API
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'ユーザー名とパスワードを入力してください。' });
    }
    
    try {
        const existing = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } });
        if (existing) return res.status(409).json({ success: false, message: 'このユーザー名はすでに使われています。別の名前を指定してください。' });
        
        const newUser = new User({ username, password, cashBalance: 0, paypayBalance: 0, hourlyWage: 1100 });
        await newUser.save();
        
        console.log(`New user registered: ${username}`);
        req.session.username = newUser.username;
        res.json({ success: true, user: { username: newUser.username } });
    } catch(e) { 
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' }); 
    }
});

// ログアウトAPI
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// リセットAPI
app.post('/api/reset', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = await User.findOne({username: req.session.username});
        if(user) {
             user.cashBalance = 0;
             user.paypayBalance = 0;
             user.hourlyWage = 1100;
             await user.save();
        }
        await Expense.deleteMany({username: req.session.username});
        await Income.deleteMany({username: req.session.username});
        await Shift.deleteMany({username: req.session.username});
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// データ取得API
app.get('/api/data', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
        const user = await User.findOne({username: req.session.username});
        if(!user) return res.status(404).json({ error: 'User not found' });

        const expenses = await Expense.find({username: req.session.username});
        const incomes = await Income.find({username: req.session.username});
        const shifts = await Shift.find({username: req.session.username});
        
        const pendingSalary = shifts.filter(s => !s.paid).reduce((sum, s) => sum + s.earnings, 0);

        res.json({
            username: user.username,
            cashBalance: user.cashBalance || 0,
            paypayBalance: user.paypayBalance || 0,
            hourlyWage: user.hourlyWage,
            expenses: expenses,
            shifts: shifts,
            incomes: incomes,
            pendingSalary: pendingSalary
        });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// 支出追加API
app.post('/api/expense', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { amount, category, date, description, paymentMethod } = req.body;
    try {
        const user = await User.findOne({username: req.session.username});
        if(!user) return res.status(404).json({error: 'User not found'});

        const expense = new Expense({
             username: req.session.username,
             amount: parseInt(amount), category, date, description, paymentMethod
        });
        await expense.save();

        if (paymentMethod === 'paypay') {
            user.paypayBalance -= parseInt(amount);
        } else {
            user.cashBalance -= parseInt(amount);
        }
        await user.save();
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// 収入追加API
app.post('/api/income', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { amount, date, description, paymentMethod } = req.body;
    try {
        const user = await User.findOne({username: req.session.username});
        if(!user) return res.status(404).json({error: 'User not found'});

        const income = new Income({
             username: req.session.username,
             amount: parseInt(amount), date, description, paymentMethod
        });
        await income.save();

        if (paymentMethod === 'paypay') {
            user.paypayBalance += parseInt(amount);
        } else {
            user.cashBalance += parseInt(amount);
        }
        await user.save();
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// シフト追加API
app.post('/api/shift', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { hours, date, hourlyWage } = req.body;
    
    try {
        const user = await User.findOne({username: req.session.username});
        if(!user) return res.status(404).json({error: 'User not found'});

        const wage = hourlyWage || user.hourlyWage;
        const earnings = parseFloat(hours) * parseInt(wage);

        const shift = new Shift({
             username: req.session.username,
             hours: parseFloat(hours), earnings, date, paid: false
        });
        await shift.save();

        user.hourlyWage = parseInt(wage);
        await user.save();

        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// 給与受取API
app.post('/api/collect-salary', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { paymentMethod } = req.body;
    try {
        const user = await User.findOne({username: req.session.username});
        if(!user) return res.status(404).json({error: 'User not found'});

        const shifts = await Shift.find({username: req.session.username, paid: false});
        let totalCollected = 0;
        
        for (let s of shifts) {
            totalCollected += s.earnings;
            s.paid = true;
            await s.save();
        }

        if (paymentMethod === 'paypay') {
            user.paypayBalance += totalCollected;
        } else {
            user.cashBalance += totalCollected;
        }
        await user.save();
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// 初期残高設定API
app.post('/api/init-savings', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    
    const { cashAmount, paypayAmount } = req.body;
    try {
        const user = await User.findOne({username: req.session.username});
        if(!user) return res.status(404).json({error: 'User not found'});

        user.cashBalance = parseInt(cashAmount || 0);
        user.paypayBalance = parseInt(paypayAmount || 0);
        await user.save();

        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
