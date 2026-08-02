import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  PermissionFlagsBits,
} from 'discord.js';
import { prisma } from '../db/client';
import { buildPollEmbedAndButtons } from '../utils/embedBuilder';
import { parseDateAndGetSlots } from '../utils/dateHelper';

export const pollCommandDefinitions = [
  new SlashCommandBuilder()
    .setName('투표생성')
    .setDescription('길드리그 참석 투표를 생성합니다.')
    .addStringOption((option) =>
      option
        .setName('날짜')
        .setDescription('투표 날짜 입력 (예: 8/4, 8/5, 오늘, 내일)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('시작시간')
        .setDescription('시작 시간 제한 (선택, 예: 19:00 입력 시 19:00부터 24:00까지 생성)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('설명')
        .setDescription('투표에 대한 추가 안내 설명 (선택)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('투표종료')
    .setDescription('진행 중인 참석 투표를 마감합니다.')
    .addIntegerOption((option) =>
      option
        .setName('투표번호')
        .setDescription('종료할 투표 ID 번호 (예: 1)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('투표현황')
    .setDescription('현재 투표 현황을 다시 확인하거나 조회합니다.')
    .addIntegerOption((option) =>
      option
        .setName('투표번호')
        .setDescription('조회할 투표 ID 번호 (미입력 시 가장 최근 투표)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('투표삭제')
    .setDescription('잘못 생성된 참석 투표를 완전 삭제합니다.')
    .addIntegerOption((option) =>
      option
        .setName('투표번호')
        .setDescription('삭제할 투표 ID 번호 (예: 1)')
        .setRequired(true)
    ),
];

export async function handlePollCommands(interaction: ChatInputCommandInteraction) {
  const { commandName, guildId, guild, channel, user, memberPermissions } = interaction;

  if (!guildId || !guild) {
    return interaction.reply({
      content: '❌ 이 명령어는 서버(길드) 내에서만 사용할 수 있습니다.',
      ephemeral: true,
    });
  }

  // Guild DB 동기화
  await prisma.guild.upsert({
    where: { id: guildId },
    update: { name: guild.name },
    create: { id: guildId, name: guild.name },
  });

  const creatorDisplayName =
    interaction.guild?.members.cache.get(user.id)?.displayName ||
    user.globalName ||
    user.username;

  if (commandName === '투표생성') {
    const dateInput = interaction.options.getString('날짜', true);
    const startTimeOverride = interaction.options.getString('시작시간', false);
    const description = interaction.options.getString('설명', false);

    // 날짜 파싱 및 평일/주말 30분 단위 선택지 자동 생성
    const { formattedTitle, timeSlots } = parseDateAndGetSlots(
      dateInput,
      startTimeOverride
    );

    const fullTitle = `${formattedTitle} 길드리그 참석 투표`;

    await interaction.deferReply();

    try {
      // 1. DB에 임시 메세지 ID로 투표 데이터 생성
      const poll = await prisma.poll.create({
        data: {
          guildId,
          channelId: interaction.channelId,
          messageId: 'TEMP_' + Date.now(),
          title: fullTitle,
          description,
          creatorId: user.id,
          options: {
            create: timeSlots.map((label, idx) => ({
              label,
              orderIndex: idx,
            })),
          },
        },
        include: {
          options: true,
          votes: true,
        },
      });

      // 2. Embed 및 버튼/드롭다운 UI 생성 (작성자 표시 닉네임 전달)
      const { embed, rows } = buildPollEmbedAndButtons(poll, creatorDisplayName);

      // 3. 디스코드 메시지 전송
      const message = await interaction.editReply({
        embeds: [embed],
        components: rows,
      });

      // 4. DB에 실제 디스코드 messageId 업데이트
      await prisma.poll.update({
        where: { id: poll.id },
        data: { messageId: message.id },
      });
    } catch (error) {
      console.error('투표 생성 오류:', error);
      return interaction.editReply({
        content: '❌ 투표 생성 중 오류가 발생했습니다.',
      });
    }
  } else if (commandName === '투표종료') {
    const pollId = interaction.options.getInteger('투표번호', true);

    const poll = await prisma.poll.findFirst({
      where: { id: pollId, guildId },
      include: { options: true, votes: true },
    });

    if (!poll) {
      return interaction.reply({
        content: `❌ 해당 투표(#${pollId})를 찾을 수 없습니다.`,
        ephemeral: true,
      });
    }

    if (poll.status === 'CLOSED') {
      return interaction.reply({
        content: `⚠️ 해당 투표(#${pollId})는 이미 종료된 투표입니다.`,
        ephemeral: true,
      });
    }

    // 투표 종료 처리
    const updatedPoll = await prisma.poll.update({
      where: { id: pollId },
      data: { status: 'CLOSED' },
      include: { options: true, votes: true },
    });

    // 기존 디스코드 메세지 업데이트 시도
    try {
      if (channel && channel.isTextBased()) {
        const textChannel = channel as TextChannel;
        const msg = await textChannel.messages.fetch(poll.messageId).catch(() => null);
        if (msg) {
          const { embed, rows } = buildPollEmbedAndButtons(updatedPoll, creatorDisplayName);
          await msg.edit({ embeds: [embed], components: rows });
        }
      }
    } catch (e) {
      console.warn('이전 메시지 갱신 실패:', e);
    }

    return interaction.reply({
      content: `🔒 투표 **#${pollId} (${poll.title})**가 성공적으로 마감되었습니다.`,
    });
  } else if (commandName === '투표현황') {
    let pollId = interaction.options.getInteger('투표번호', false);

    let poll;
    if (pollId) {
      poll = await prisma.poll.findFirst({
        where: { id: pollId, guildId },
        include: { options: true, votes: true },
      });
    } else {
      poll = await prisma.poll.findFirst({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        include: { options: true, votes: true },
      });
    }

    if (!poll) {
      return interaction.reply({
        content: '❌ 조회할 수 있는 투표가 없습니다.',
        ephemeral: true,
      });
    }

    const { embed, rows } = buildPollEmbedAndButtons(poll, creatorDisplayName);
    return interaction.reply({
      content: `📊 **투표 #${poll.id} 현황 조회 결과**`,
      embeds: [embed],
      components: rows,
      ephemeral: true,
    });
  } else if (commandName === '투표삭제') {
    const pollId = interaction.options.getInteger('투표번호', true);

    const poll = await prisma.poll.findFirst({
      where: { id: pollId, guildId },
    });

    if (!poll) {
      return interaction.reply({
        content: `❌ 해당 투표(#${pollId})를 찾을 수 없습니다.`,
        ephemeral: true,
      });
    }

    // 권한 검사: 투표 생성자이거나 관리자/메시지 관리 권한이 있는 경우만 삭제 가능
    const isCreator = poll.creatorId === user.id;
    const isAdmin =
      memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      memberPermissions?.has(PermissionFlagsBits.ManageMessages);

    if (!isCreator && !isAdmin) {
      return interaction.reply({
        content: '❌ 이 투표를 삭제할 권한이 없습니다. (투표 작성자 또는 관리자만 삭제 가능)',
        ephemeral: true,
      });
    }

    // 1. 디스코드 원본 투표 메시지 삭제 시도
    try {
      if (channel && channel.isTextBased()) {
        const textChannel = channel as TextChannel;
        const msg = await textChannel.messages.fetch(poll.messageId).catch(() => null);
        if (msg) {
          await msg.delete();
        }
      }
    } catch (e) {
      console.warn('투표 메세지 삭제 중 오류 (이미 삭제되었을 수 있음):', e);
    }

    // 2. DB에서 투표 삭제 (Option 및 Vote는 Cascade 삭제됨)
    await prisma.poll.delete({
      where: { id: pollId },
    });

    return interaction.reply({
      content: `🗑️ 투표 **#${pollId} (${poll.title})**가 성공적으로 삭제되었습니다.`,
    });
  }
}
