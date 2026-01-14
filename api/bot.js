const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// تهيئة المفاتيح من متغيرات البيئة (أمان أفضل)
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SYSTEM_PROMPT = `أنت الأستاذ الدكتور مصطفى، موجه أول بوزارة التربية والتعليم المصرية... (أكمل النص السابق)`;

// --- معالجة أمر البداية /start ---
bot.start(async (ctx) => {
    const welcome = "أهلاً بك يا بني في بوت المساعد التعليمي (برشامة بلس) 🎓. أرسل صورة السؤال وسأقوم بحله فوراً.";
    return ctx.reply(welcome);
});

// --- معالجة الصور ---
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'User';

    try {
        // 1. التحقق من الحظر وزيادة العداد في Supabase
        const { data: user } = await supabase.from('users').select('*').eq('user_id', userId).single();
        if (user && user.is_banned) return ctx.reply("❌ تم حظرك من قبل الإدارة.");

        await supabase.from('users').upsert({ user_id: userId, username: username, usage_count: (user?.usage_count || 0) + 1 });

        const statusMsg = await ctx.reply("⏳ جاري تحليل الصورة بالذكاء الاصطناعي...");

        // 2. جلب رابط الصورة
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        // 3. تحليل الصورة عبر Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const imgResponse = await fetch(fileLink);
        const buffer = await imgResponse.arrayBuffer();

        const result = await model.generateContent([
            SYSTEM_PROMPT,
            { inlineData: { data: Buffer.from(buffer).toString("base64"), mimeType: "image/jpeg" } }
        ]);

        // 4. إرسال الإجابة وتعديل رسالة الانتظار
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, result.response.text(), { parse_mode: 'Markdown' });

    } catch (err) {
        console.error(err);
        ctx.reply("⚠️ حدث خطأ فني، تأكد من وضوح الصورة وحاول ثانية.");
    }
});

// تصدير الدالة لتناسب نظام Vercel Serverless
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot is running...');
        }
    } catch (err) {
        console.error("Webhook Error:", err);
        res.status(500).send('Internal Server Error');
    }
};