require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const prefix = process.env.PREFIX || '.';

if (!token || token === 'ISI_TOKEN_BOT_TELEGRAM_DISINI') {
    console.error('Bot token is not defined! Silakan isi BOT_TOKEN di file .env');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const plugins = new Map();

// Load plugins dari folder plugins/
const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir);
}

const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));

console.log('--- Loading Plugins ---');
for (const file of pluginFiles) {
    const pluginPath = path.join(pluginsDir, file);
    try {
        const plugin = require(pluginPath);
        if (plugin.command && typeof plugin.execute === 'function') {
            plugins.set(plugin.command.toLowerCase(), plugin);
            console.log(`[+] Loaded: ${file} (Command: ${prefix}${plugin.command})`);
        } else {
            console.warn(`[!] Invalid plugin in ${file}: Harus memiliki 'command' dan 'execute()'.`);
        }
    } catch (err) {
        console.error(`[-] Gagal memuat plugin ${file}:`, err);
    }
}
console.log('-----------------------\n');

// Handle pesan masuk
bot.on('message', async (msg) => {
    const text = msg.text || '';
    
    // Abaikan pesan yang tidak diawali prefix
    if (!text.startsWith(prefix)) return;

    // Memisahkan perintah dan argumen
    const args = text.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Cari plugin yang sesuai
    const command = plugins.get(commandName);

    if (command) {
        try {
            await command.execute(bot, msg, args, plugins);
        } catch (error) {
            console.error(`Error saat mengeksekusi '${commandName}':`, error);
            bot.sendMessage(msg.chat.id, '❌ Terjadi kesalahan pada sistem saat mengeksekusi perintah ini.');
        }
    }
});

console.log('✅ Bot sedang berjalan...');
