import { ButtonInteraction, StringSelectMenuInteraction, MessageFlags } from 'discord.js';
import { prisma } from '../db/client';
import { buildPollEmbedAndButtons, buildPersonalVotePanel } from '../utils/embedBuilder';

export async function handleButtonInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
) {
  let pollId: number = 0;
  let action: string = '';
  let selectedOptionIds: number[] = [];

  if (interaction.isStringSelectMenu()) {
    const values = interaction.values;
    if (!values || values.length === 0) return;

    const firstPart = values[0].split('_');
    pollId = parseInt(firstPart[1], 10);
    action = firstPart[2];

    selectedOptionIds = values.map((val) => {
      const p = val.split('_');
      return parseInt(p[3], 10);
    });
  } else {
    // Button Interaction
    const customId = interaction.customId;
    if (!customId.startsWith('vote_')) return;

    const parts = customId.split('_');
    pollId = parseInt(parts[1], 10);
    action = parts[2];
    const optionIdStr = parts[3];

    if ((action === 'attend' || action === 'toggle') && optionIdStr) {
      selectedOptionIds = [parseInt(optionIdStr, 10)];
    }
  }

  if (isNaN(pollId) || pollId <= 0) return;

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { options: true, votes: true },
  });

  if (!poll) {
    return interaction.reply({
      content: '❌ 존재하지 않거나 삭제된 투표입니다.',
      ephemeral: true,
    });
  }

  // 1. 🗳️ 내 참석 설정 & 명단 확인 버튼 클릭 시 (개인 전용 에페메랄 패널 생성)
  if (action === 'open' && interaction.customId.includes('_open_panel')) {
    const { embed, rows } = buildPersonalVotePanel(poll, interaction.user.id, false);
    return interaction.reply({
      embeds: [embed],
      components: rows,
      ephemeral: true,
    });
  }

  // 2. 🔽 / 🔼 개인 패널 내 명단 펼치기/접기 버튼 클릭 시
  if (action === 'privatetoggleexpand') {
    const parts = interaction.customId.split('_');
    const targetState = parts[3]; // 'open' or 'close'
    const newIsExpanded = targetState === 'open';

    const { embed, rows } = buildPersonalVotePanel(poll, interaction.user.id, newIsExpanded);
    return interaction.update({ embeds: [embed], components: rows });
  }

  // 3. ❌ 개인 패널 닫기 버튼 클릭 시
  if (action === 'close' && interaction.isButton()) {
    return interaction.update({
      content: '🔒 개인 패널이 닫혔습니다.',
      embeds: [],
      components: [],
    });
  }

  if (action === 'refresh') {
    const { embed, rows } = buildPollEmbedAndButtons(poll);
    await interaction.update({ embeds: [embed], components: rows });
    return;
  }

  if (poll.status === 'CLOSED') {
    return interaction.reply({
      content: '🔒 이 투표는 이미 마감되었습니다.',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  const userDisplayName =
    interaction.guild?.members.cache.get(userId)?.displayName ||
    interaction.user.globalName ||
    interaction.user.username;

  // 기존 유저의 참석 옵션 ID 목록 (DB 조회)
  const previousOptionIds = poll.votes
    .filter((v) => v.userId === userId && v.status === 'ATTEND' && v.optionId !== null)
    .map((v) => v.optionId as number);

  // 누적/토글(Merge & Toggle) 로직
  const finalOptionSet = new Set<number>(previousOptionIds);

  selectedOptionIds.forEach((optId) => {
    if (finalOptionSet.has(optId)) {
      finalOptionSet.delete(optId); // 이미 선택했던 시간이면 제거 (Toggle OFF)
    } else {
      finalOptionSet.add(optId); // 안 고른 시간이면 추가 (Toggle ON)
    }
  });

  const finalOptionIds = Array.from(finalOptionSet);

  // DB 투표 저장 처리
  if (action === 'all') {
    const allOptionIds = poll.options.map((o) => o.id);
    await prisma.$transaction([
      prisma.vote.deleteMany({
        where: { pollId: poll.id, userId },
      }),
      prisma.vote.createMany({
        data: allOptionIds.map((optId) => ({
          pollId: poll.id,
          userId,
          userDisplayName,
          status: 'ATTEND',
          optionId: optId,
          updatedAt: new Date(),
        })),
      }),
    ]);
  } else if (action === 'attend' || action === 'toggle') {
    if (finalOptionIds.length === 0) {
      await prisma.vote.deleteMany({
        where: { pollId: poll.id, userId },
      });
    } else {
      await prisma.$transaction([
        prisma.vote.deleteMany({
          where: { pollId: poll.id, userId },
        }),
        prisma.vote.createMany({
          data: finalOptionIds.map((optId) => ({
            pollId: poll.id,
            userId,
            userDisplayName,
            status: 'ATTEND',
            optionId: optId,
            updatedAt: new Date(),
          })),
        }),
      ]);
    }
  } else if (action === 'absent') {
    await prisma.$transaction([
      prisma.vote.deleteMany({
        where: { pollId: poll.id, userId },
      }),
      prisma.vote.create({
        data: {
          pollId: poll.id,
          userId,
          userDisplayName,
          status: 'ABSENT',
          optionId: null,
        },
      }),
    ]);
  } else if (action === 'pending') {
    await prisma.$transaction([
      prisma.vote.deleteMany({
        where: { pollId: poll.id, userId },
      }),
      prisma.vote.create({
        data: {
          pollId: poll.id,
          userId,
          userDisplayName,
          status: 'PENDING',
          optionId: null,
        },
      }),
    ]);
  }

  // 갱신된 전체 투표 데이터 재조회
  const updatedPoll = await prisma.poll.findUnique({
    where: { id: poll.id },
    include: { options: true, votes: true },
  });

  if (!updatedPoll) return;

  const isEphemeralInteraction =
    action === 'toggle' ||
    interaction.customId.includes('_toggle_') ||
    interaction.customId.includes('_privatetoggleexpand_') ||
    Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));

  if (isEphemeralInteraction) {
    // 개인 패널 내의 현재 펼침/접힘 상태 확인
    let currentIsExpanded = false;
    if (interaction.message && interaction.message.components.length > 0) {
      const statusRow = interaction.message.components[0] as any;
      if (statusRow && statusRow.components) {
        const toggleBtn = statusRow.components.find(
          (c: any) =>
            c.customId &&
            typeof c.customId === 'string' &&
            c.customId.includes('_privatetoggleexpand_')
        );
        if (toggleBtn && toggleBtn.customId?.includes('_close')) {
          currentIsExpanded = true;
        }
      }
    }

    // 개인 패널(Ephemeral) 업데이트 -> 파란색/회색 버튼 즉시 토글!
    const { embed: personalEmbed, rows: personalRows } = buildPersonalVotePanel(
      updatedPoll,
      userId,
      currentIsExpanded
    );
    await interaction.update({ embeds: [personalEmbed], components: personalRows });

    // 공용 메시지도 백그라운드에서 실시간 현황 갱신
    try {
      if (interaction.channel && interaction.channel.isTextBased()) {
        const textChannel = interaction.channel as any;
        const msg = await textChannel.messages.fetch(poll.messageId).catch(() => null);
        if (msg) {
          const { embed: pubEmbed, rows: pubRows } = buildPollEmbedAndButtons(updatedPoll);
          await msg.edit({ embeds: [pubEmbed], components: pubRows });
        }
      }
    } catch (e) {
      console.warn('공용 메시지 백그라운드 갱신 실패:', e);
    }
    return;
  }

  // 공용 메시지에서 직접 클릭 시
  const { embed, rows } = buildPollEmbedAndButtons(updatedPoll);
  await interaction.update({ embeds: [embed], components: rows });

  let statusMsg = '';
  if (action === 'all') {
    statusMsg = '🟢 **모든 시간대 [전체 참석]으로 등록되었습니다!**';
  } else if (action === 'attend' || action === 'toggle') {
    statusMsg = '✅ **참석 시간대가 성공적으로 갱신되었습니다!**';
  } else if (action === 'absent') {
    statusMsg = '🔴 **[불참]** 으로 투표가 완료되었습니다.';
  } else {
    statusMsg = '🟡 **[미정]** 으로 투표가 완료되었습니다.';
  }

  await interaction.followUp({
    content: statusMsg,
    ephemeral: true,
  });
}
