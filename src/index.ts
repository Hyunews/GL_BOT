import { Client, GatewayIntentBits, Events } from 'discord.js';
import express from 'express';
import { CONFIG } from './config';
import { handlePollCommands } from './commands/pollCommands';
import { handleButtonInteraction } from './events/interactionHandler';
import { deployCommands } from './deploy-commands';
import { prisma } from './db/client';

// 1. Express Server (Render / Koyeb 무료 웹버퍼 헬스체크용)
const app = express();
const PORT = CONFIG.PORT;

app.get('/', (req, res) => {
  res.send('🤖 Guild League Vote Bot is Running!');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(`🌐 Express 헬스체크 서버가 포트 ${PORT}에서 실행 중입니다.`);
});

// 2. Discord Client 초기화
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ 봇 로그인 완료: ${readyClient.user.tag}`);
  console.log(`🔗 봇이 작동 중인 서버 수: ${client.guilds.cache.size}개`);

  // DB 연동 및 슬래시 커맨드 자동 등록 (길드 단위 즉시 동기화)
  try {
    await prisma.$connect();
    console.log('📦 PostgreSQL 데이터베이스에 정상적으로 연결되었습니다.');
    const guildIds = client.guilds.cache.map((g) => g.id);
    await deployCommands(guildIds);
  } catch (err) {
    console.error('❌ DB 연결 또는 명령어 등록 실패:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handlePollCommands(interaction);
    } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await handleButtonInteraction(interaction);
    }
  } catch (error) {
    console.error('인터랙션 처리 오류:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ 처리 중 내부 오류가 발생했습니다.',
        ephemeral: true,
      });
    }
  }
});

// 봇 로그인
if (CONFIG.DISCORD_TOKEN) {
  client.login(CONFIG.DISCORD_TOKEN).catch((err) => {
    console.error('❌ 디스코드 로그인 실패! 토큰을 확인해 주세요:', err);
  });
} else {
  console.error('❌ DISCORD_TOKEN이 설정되지 않았습니다. .env 파일을 생성해 주세요.');
}
