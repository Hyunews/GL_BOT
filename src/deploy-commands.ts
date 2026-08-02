import { REST, Routes } from 'discord.js';
import { CONFIG } from './config';
import { pollCommandDefinitions } from './commands/pollCommands';

export async function deployCommands(guildIds?: string[]) {
  if (!CONFIG.DISCORD_TOKEN || !CONFIG.CLIENT_ID) {
    console.warn('⚠️ DISCORD_TOKEN 또는 CLIENT_ID가 누락되어 슬래시 커맨드를 등록할 수 없습니다.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);
  const commandsJSON = pollCommandDefinitions.map((cmd) => cmd.toJSON());

  try {
    console.log('🔄 슬래시 커맨드를 디스코드 API에 등록하는 중...');

    // 1. 글로벌 애플리케이션 명령어 등록
    await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), {
      body: commandsJSON,
    });

    // 2. 현재 봇이 속한 각 디스코드 서버(길드)에 커맨드 즉시 동기화 (디스코드 캐시 지연 0초 해결)
    if (guildIds && guildIds.length > 0) {
      for (const gId of guildIds) {
        await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, gId), {
          body: commandsJSON,
        });
      }
      console.log(`⚡ ${guildIds.length}개 서버에 슬래시 커맨드가 즉시 반영되었습니다!`);
    } else {
      console.log('✅ 슬래시 커맨드 글로벌 등록 성공!');
    }
  } catch (error) {
    console.error('❌ 슬래시 커맨드 등록 실패:', error);
  }
}

// 직접 스크립트로 실행 시
if (require.main === module) {
  deployCommands();
}
