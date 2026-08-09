// 🕐 서버 타임존을 KST(Asia/Seoul)로 고정
process.env.TZ = 'Asia/Seoul';

// 🔍 진단: 잡히지 않는 예외/거부 전부 출력
process.on('uncaughtException', (err) => {
  console.error('🔥 [CRITICAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('🔥 [CRITICAL] unhandledRejection:', reason);
});

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
    // GuildMembers 인텐트 제거: 연결 시 전체 멤버 청크 수신을 시도하다 hang 발생 가능
    // 닉네임은 interaction.user.globalName || username 폴백으로 처리
  ],
});

// Discord 클라이언트 레벨 에러/경고 수신
client.on('error', (err) => {
  console.error('🔥 Discord 클라이언트 오류:', err);
});
client.on('warn', (info) => {
  console.warn('⚠️ Discord 클라이언트 경고:', info);
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
    // defer 이후에는 reply() 대신 followUp() 사용
    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await (interaction as any).followUp({
            content: '❌ 처리 중 내부 오류가 발생했습니다.',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: '❌ 처리 중 내부 오류가 발생했습니다.',
            ephemeral: true,
          });
        }
      }
    } catch (replyError) {
      console.error('에러 응답 전송 실패:', replyError);
    }
  }
});

// 봇 로그인
console.log(`🔍 [진단] DISCORD_TOKEN 설정 여부: ${CONFIG.DISCORD_TOKEN ? `YES (길이: ${CONFIG.DISCORD_TOKEN.length})` : 'NO (비어있음)'}`);
console.log(`🔍 [진단] CLIENT_ID 설정 여부: ${CONFIG.CLIENT_ID ? 'YES' : 'NO'}`);
console.log(`🔍 [진단] DATABASE_URL 설정 여부: ${CONFIG.DATABASE_URL ? 'YES' : 'NO'}`);

if (CONFIG.DISCORD_TOKEN) {
  console.log('🔑 Discord 로그인 시도 중...');

  // 30초 내 로그인 안 되면 경고 출력 (연결 hang 감지)
  const loginTimer = setTimeout(() => {
    console.error('⏰ [경고] 30초 내 Discord 로그인 완료 안 됨. 네트워크/토큰 문제 가능성.');
  }, 30000);

  client.once(Events.ClientReady, () => {
    clearTimeout(loginTimer);
  });

  client.login(CONFIG.DISCORD_TOKEN).catch((err) => {
    clearTimeout(loginTimer);
    console.error('❌ 디스코드 로그인 실패! 토큰을 확인해 주세요:', err);
  });
} else {
  console.error('❌ DISCORD_TOKEN이 설정되지 않았습니다. .env 파일을 생성해 주세요.');
}
