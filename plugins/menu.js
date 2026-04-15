module.exports = {
    command: 'menu',
    description: 'Menampilkan daftar semua perintah bot',
    execute: async (bot, msg, args, plugins) => {
        const chatId = msg.chat.id;
        const prefix = process.env.PREFIX || '.';
        
        let text = '*🤖 DAFTAR MENU BOT*\n\n';
        text += 'Berikut adalah perintah yang bisa kamu gunakan:\n';
        
        // Looping semua plugin yang terdaftar di Map
        for (const [cmd, plugin] of plugins.entries()) {
            text += `\n🔸 \`${prefix}${cmd}\``;
            if (plugin.description) {
                text += ` - ${plugin.description}`;
            }
        }
        
        text += '\n\n_Ketik perintah di atas untuk menggunakannya._';
        
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    }
};
