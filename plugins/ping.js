module.exports = {
    command: 'ping',
    description: 'Mengecek status dan respons waktu bot',
    execute: async (bot, msg, args) => {
        const chatId = msg.chat.id;
        
        const start = Date.now();
        const sentMsg = await bot.sendMessage(chatId, 'Pinging...');
        const end = Date.now();
        
        const time = end - start;
        
        await bot.editMessageText(`*Pong!* 🏓\nResponse time: \`${time}ms\``, {
            chat_id: chatId,
            message_id: sentMsg.message_id,
            parse_mode: 'Markdown'
        });
    }
};
