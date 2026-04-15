module.exports = {
    command: 'echo',
    description: 'Menirukan atau mengulangi pesan yang kamu ketik',
    execute: async (bot, msg, args) => {
        const chatId = msg.chat.id;
        
        if (args.length === 0) {
            return bot.sendMessage(chatId, 'Format salah! Gunakan: `.echo [pesan kamu]`\nContoh: `.echo Halo dunia!`', { parse_mode: 'Markdown' });
        }
        
        const replyText = args.join(' ');
        await bot.sendMessage(chatId, replyText);
    }
};
