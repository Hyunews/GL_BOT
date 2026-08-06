import { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { prisma } from '../db/client';
import { buildPollEmbedAndButtons } from '../utils/embedBuilder';

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
    action = firstPart[2]; // 'attend'

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

  // 현재 메시지의 접기/펼치기 상태 파악
  let isExpanded = false;
  if (interaction.message && interaction.message.components.length > 0) {
    const statusRow = interaction.message.components[0] as any;
    if (statusRow && statusRow.components) {
      const expandBtn = statusRow.components.find(
        (c: any) => c.customId && typeof c.customId === 'string' && c.customId.includes('_toggleexpand_')
      );
      if (expandBtn && expandBtn.customId?.includes('_close')) {
        isExpanded = true;
      }
    }
  }

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

  // 🔽 / 🔼 명단 펼치기 / 명단 접기 버튼 클릭 시 (공용 메시지에서 즉시 전환)
  if (action === 'toggleexpand') {
    const parts = (interaction.isButton() ? interaction.customId : '').split('_');
    const targetState = parts[3]; // 'open' or 'close'
    const newIsExpanded = targetState === 'open';

    const { embed, rows } = buildPollEmbedAndButtons(poll, undefined, newIsExpanded);
    await interaction.update({ embeds: [embed], components: rows });
    return;
  }

  if (action === 'refresh') {
    const { embed, rows } = buildPollEmbedAndButtons(poll, undefined, isExpanded);
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

  // 누적/토글(Merge & Toggle) 로직:
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

  const { embed, rows } = buildPollEmbedAndButtons(updatedPoll, undefined, isExpanded);

  // 메시지 갱신 및 유저에게 응답
  await interaction.update({ embeds: [embed], components: rows });

  // 추가/제거 및 선착순 10명 참석/대기 피드백 메시지 생성
  let statusMsg = '';
  if (action === 'all') {
    const allOptionIds = updatedPoll.options.map((o) => o.id);
    const currentSummaries = updatedPoll.options
      .filter((o) => allOptionIds.includes(o.id))
      .map((o) => {
        const optionVotes = (updatedPoll.votes || [])
          .filter((v) => v.optionId === o.id && v.status === 'ATTEND')
          .sort((a, b) => a.id - b.id);
        const userIndex = optionVotes.findIndex((v) => v.userId === userId);
        if (userIndex >= 0 && userIndex < 10) {
          return `${o.label} (✅ 참석 ${userIndex + 1}번째)`;
        } else if (userIndex >= 10) {
          return `${o.label} (⏳ 대기 ${userIndex - 9}번)`;
        }
        return o.label;
      });

    statusMsg = `🟢 **모든 시간대 [전체 참석]으로 등록되었습니다!**\n⏰ **현재 신청 시간대**: ${currentSummaries.join(', ')}`;
  } else if (action === 'attend' || action === 'toggle') {
    const addedIds = finalOptionIds.filter((id) => !previousOptionIds.includes(id));
    const removedIds = previousOptionIds.filter((id) => !finalOptionIds.includes(id));

    const addedLabels = updatedPoll.options.filter((o) => addedIds.includes(o.id)).map((o) => o.label);
    const removedLabels = updatedPoll.options.filter((o) => removedIds.includes(o.id)).map((o) => o.label);

    const currentSummaries = updatedPoll.options
      .filter((o) => finalOptionIds.includes(o.id))
      .map((o) => {
        const optionVotes = (updatedPoll.votes || [])
          .filter((v) => v.optionId === o.id && v.status === 'ATTEND')
          .sort((a, b) => a.id - b.id);
        const userIndex = optionVotes.findIndex((v) => v.userId === userId);
        if (userIndex >= 0 && userIndex < 10) {
          return `${o.label} (✅ 참석 ${userIndex + 1}번째)`;
        } else if (userIndex >= 10) {
          return `${o.label} (⏳ 대기 ${userIndex - 9}번)`;
        }
        return o.label;
      });

    statusMsg = `✅ **참석 시간대가 성공적으로 갱신되었습니다!**\n`;
    if (addedLabels.length > 0) {
      statusMsg += `➕ **새로 추가된 시간**: ${addedLabels.join(', ')}\n`;
    }
    if (removedLabels.length > 0) {
      statusMsg += `➖ **제외된 시간**: ${removedLabels.join(', ')}\n`;
    }
    statusMsg += `⏰ **현재 신청 시간대**: ${currentSummaries.length > 0 ? currentSummaries.join(', ') : '_없음_'}`;
  } else if (action === 'absent') {
    statusMsg = '🔴 **[불참]** 으로 투표가 완료되었습니다. (기존 참석 시간대가 모두 취소되었습니다)';
  } else {
    statusMsg = '🟡 **[미정/대기]** 로 투표가 완료되었습니다. (기존 참석 시간대가 보류 처리되었습니다)';
  }

  await interaction.followUp({
    content: statusMsg,
    ephemeral: true,
  });
}
