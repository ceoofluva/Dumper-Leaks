require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder, ChannelType } = require('discord.js');
const axios = require('axios');
const { processScript } = require('./lua_runner');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: ['CHANNEL'] // REQUIRED for DMs
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('Bot ready in guilds + DMs');
});

// Extract code block from message content
function extractCodeBlock(content) {
    // Important: Language specifier is ONLY recognized if followed by a newline
    // This prevents 'print' from being mistaken as a language in ```print('hello')```
    
    // Pattern: ```[language]\n[code]\n``` where language is optional but only if followed by newline
    // This regex ensures the language is only matched when there's a newline after it
    const match = content.match(/```(?:([a-z]+)\n)?([\s\S]*?)```/);
    
    if (match) {
        return {
            code: match[2].trim(),
            language: match[1] || 'lua'
        };
    }
    
    return null;
}

// Escape special characters in Lua patterns
function escapeLuaPattern(str) {
    return str.replace(/[%()\[\]\.%+\-\*\?]/g, function(char) {
        return '%' + char;
    });
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isDM = message.channel.type === ChannelType.DM;
    const content = message.content.trim();

    console.log(
        `[${isDM ? 'DM' : message.guild?.name}] ${message.author.tag}: ${content}`
    );

    if (!content.startsWith('.')) return;

    // HELP
    if (content === '.help') {
        await message.reply(
            '**Available Commands:**\n' +
            '`.l` – Process Lua code: `.l ```lua code ``` ` or attach a file\n' +
            '`.l \\`\\`\\`code\\`\\`\\`` – Inline code block\n' +
            'Works in servers *and* DMs'
        );
        return;
    }

    // PROCESS LUA
    if (content.startsWith('.l')) {
        let scriptContent = null;
        let sourceType = '';

        // Extract the part after '.l'
        const afterCommand = content.substring(2).trim();

        // FIRST: Check for inline code block
        if (afterCommand) {
            const codeBlock = extractCodeBlock(afterCommand);
            if (codeBlock) {
                scriptContent = codeBlock.code;
                sourceType = `inline code block (${codeBlock.language})`;
                console.log(`[DEBUG] Found inline code block`);
            }
        }

        // SECOND: Check for attachments if no inline code block
        if (!scriptContent && message.attachments.size > 0) {
            const attachment = message.attachments.first();

            // Optional safety filter
            if (!attachment.name.match(/\.(lua|txt)$/i)) {
                await message.reply('Only `.lua` or `.txt` files are allowed.');
                return;
            }

            try {
                const res = await axios.get(attachment.url, {
                    responseType: 'text',
                    maxContentLength: 10 * 1024 * 1024 // 10MB safety
                });
                scriptContent = res.data;
                sourceType = `attachment (${attachment.name})`;
                console.log(`[DEBUG] Found attachment: ${attachment.name}`);
            } catch (err) {
                console.error(err);
                await message.reply(`Error reading attachment: ${err.message}`);
                return;
            }
        }

        // If nothing found, show help
        if (!scriptContent) {
            await message.reply(
                'Please provide code:\n' +
                '• `.l ```lua\nprint("hello")\n``` ` – Inline code block\n' +
                '• Or attach a `.lua` or `.txt` file'
            );
            return;
        }

        try {
            const status = await message.reply('Processing script...');

            const output = await processScript(scriptContent);

            // Generate random 6-character name
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let randomName = '';
            for (let i = 0; i < 6; i++) {
                randomName += chars.charAt(Math.floor(Math.random() * chars.length));
            }

            const file = new AttachmentBuilder(
                Buffer.from(output, 'utf8'),
                { name: `${randomName}.lua` }
            );

            await status.edit({
                content: `Done ✅ (from ${sourceType})`,
                files: [file]
            });

        } catch (err) {
            console.error(err);
            await message.reply(`Error: ${err.message}`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
