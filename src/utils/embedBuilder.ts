import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';

export interface FullPollData {
  id: number;
  title: string;
  description: string | null;
  status: string;
  createdAt: Date;
  creatorId: string;
  creatorDisplayName?: string;
  options: {
    id: number;
    label: string;
    orderIndex: number;
  }[];
  votes: {
    id: number;
    userId: string;
    userDisplayName: string;
    status: string;
    optionId: number | null;
  }[];
}

export function buildPollEmbedAndButtons(
  poll: FullPollData,
  creatorDisplayName?: string,
  isExpanded: boolean = false
) {
  const isClosed = poll.status === 'CLOSED';

  // 옵션별 참석자 분류 (선착순 정렬 보장: vote.id 순)
  const optionVotesMap: Record<number, { userId: string; voteId: number }[]> = {};
  poll.options.forEach((opt) => {
    optionVotesMap[opt.id] = [];
  });

  const absentList: string[] = [];
  const pendingList: string[] = [];

  // 선착순 보장을 위해 ID 오름차순 정렬
  const sortedVotes = [...poll.votes].sort((a, b) => a.id - b.id);

  sortedVotes.forEach((vote) => {
    const mention = `<@${vote.userId}>`;
    if (vote.status === 'ATTEND' && vote.optionId && optionVotesMap[vote.optionId]) {
      // 동일 유저 중복 방지
      if (!optionVotesMap[vote.optionId].some((v) => v.userId === vote.userId)) {
        optionVotesMap[vote.optionId].push({ userId: vote.userId, voteId: vote.id });
      }
    } else if (vote.status === 'ABSENT') {
      if (!absentList.includes(mention)) absentList.push(mention);
    } else if (vote.status === 'PENDING') {
      if (!pendingList.includes(mention)) pendingList.push(mention);
    }
  });

  // 작성자 표시 닉네임 구하기
  const creatorName =
    creatorDisplayName ||
    poll.creatorDisplayName ||
    poll.votes.find((v) => v.userId === poll.creatorId)?.userDisplayName ||
    '관리자';

  // Embed 구성
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${poll.title}`)
    .setDescription(
      poll.description
        ? `${poll.description}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        : '아래 **시간대 버튼을 클릭**하여 신청/취소하거나 드롭다운을 이용해 주세요!\n*(시간대별 **최대 10명 선착순 참석**, 11번째부터는 **대기자**로 자동 등록됩니다)*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    )
    .setColor(isClosed ? 0x95a5a6 : 0x5865f2)
    .setTimestamp(poll.createdAt)
    .setFooter({
      text: isClosed
        ? '🔒 이 투표는 마감되었습니다.'
        : `투표 번호: #${poll.id} | 작성자: ${creatorName}`,
    });

  let totalConfirmedSlots = 0;
  let totalWaitlistSlots = 0;

  if (isExpanded) {
    // 🔽 명단 펼친 상태: 시간대별 상세 멘션 명단 표시
    poll.options.forEach((opt) => {
      const allMembers = optionVotesMap[opt.id] || [];
      const mainRoster = allMembers.slice(0, 10);
      const waitlist = allMembers.slice(10);

      totalConfirmedSlots += mainRoster.length;
      totalWaitlistSlots += waitlist.length;

      const mainText =
        mainRoster.length > 0
          ? mainRoster.map((m) => `<@${m.userId}>`).join(', ')
          : '_참석자 없음_';

      let fieldTitle = '';
      if (allMembers.length >= 10) {
        fieldTitle = `⏰ ${opt.label} (10/10명 🔒 마감${
          waitlist.length > 0 ? ` | ⏳ 대기 ${waitlist.length}명` : ''
        })`;
      } else {
        fieldTitle = `⏰ ${opt.label} (${allMembers.length}/10명)`;
      }

      let fieldValue = mainText;
      if (waitlist.length > 0) {
        const waitText = waitlist
          .map((m, idx) => `<@${m.userId}>(대기${idx + 1})`)
          .join(', ');
        fieldValue += `\n> ⏳ **대기 명단**: ${waitText}`;
      }

      embed.addFields({
        name: fieldTitle,
        value: fieldValue,
        inline: false,
      });
    });
  } else {
    // 🔼 명단 접은 상태: 요약 현황만 깔끔하게 표시
    const slotSummaryLines: string[] = [];
    poll.options.forEach((opt) => {
      const allMembers = optionVotesMap[opt.id] || [];
      const mainRoster = allMembers.slice(0, 10);
      const waitlist = allMembers.slice(10);

      totalConfirmedSlots += mainRoster.length;
      totalWaitlistSlots += waitlist.length;

      if (allMembers.length >= 10) {
        slotSummaryLines.push(
          `⏰ **${opt.label}** : **10/10명** 🔒 마감${
            waitlist.length > 0 ? ` (⏳ 대기 **${waitlist.length}명**)` : ''
          }`
        );
      } else {
        slotSummaryLines.push(`⏰ **${opt.label}** : **${allMembers.length}/10명**`);
      }
    });

    embed.addFields({
      name: '📊 시간대별 참석 현황 요약',
      value: slotSummaryLines.join('\n') || '_등록된 시간대가 없습니다._',
      inline: false,
    });
  }

  // 불참 및 미정 필드
  embed.addFields(
    {
      name: `🔴 불참 (${absentList.length}명)`,
      value: absentList.length > 0 ? absentList.join(', ') : '_없음_',
      inline: true,
    },
    {
      name: `🟡 미정/대기 (${pendingList.length}명)`,
      value: pendingList.length > 0 ? pendingList.join(', ') : '_없음_',
      inline: true,
    }
  );

  // 참석 확정 유니크 유저 계산
  const confirmedUserSet = new Set<string>();
  const waitlistUserSet = new Set<string>();

  poll.options.forEach((opt) => {
    const members = optionVotesMap[opt.id] || [];
    members.slice(0, 10).forEach((m) => confirmedUserSet.add(m.userId));
    members.slice(10).forEach((m) => {
      if (!confirmedUserSet.has(m.userId)) {
        waitlistUserSet.add(m.userId);
      }
    });
  });

  // 총 현황 요약
  embed.addFields({
    name: '📊 전체 요약',
    value: `참석 확정 **${confirmedUserSet.size}명** (총 ${totalConfirmedSlots}개 슬롯)${
      waitlistUserSet.size > 0 ? ` | ⏳ 대기 **${waitlistUserSet.size}명**` : ''
    } | 불참 **${absentList.length}명** | 미정 **${pendingList.length}명**`,
    inline: false,
  });

  const rows: ActionRowBuilder<any>[] = [];

  // Row 0: 공통 상태 버튼 + 명단 펼치기/접기 버튼
  const statusRow = new ActionRowBuilder<ButtonBuilder>();

  const allAttendBtn = new ButtonBuilder()
    .setCustomId(`vote_${poll.id}_all`)
    .setLabel('🟢 전체 참석')
    .setStyle(ButtonStyle.Success)
    .setDisabled(isClosed);

  const absentBtn = new ButtonBuilder()
    .setCustomId(`vote_${poll.id}_absent`)
    .setLabel('🔴 불참')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(isClosed);

  const pendingBtn = new ButtonBuilder()
    .setCustomId(`vote_${poll.id}_pending`)
    .setLabel('🟡 미정/대기')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isClosed);

  const refreshBtn = new ButtonBuilder()
    .setCustomId(`vote_${poll.id}_refresh`)
    .setLabel('🔄 현황 갱신')
    .setStyle(ButtonStyle.Secondary);

  const toggleExpandBtn = new ButtonBuilder()
    .setCustomId(`vote_${poll.id}_toggleexpand_${isExpanded ? 'close' : 'open'}`)
    .setLabel(isExpanded ? '🔼 명단 접기' : '🔽 명단 펼치기')
    .setStyle(isExpanded ? ButtonStyle.Primary : ButtonStyle.Secondary);

  statusRow.addComponents(allAttendBtn, absentBtn, pendingBtn, refreshBtn, toggleExpandBtn);
  rows.push(statusRow);

  // Row 1~4: 시간대 투표 조작 (1클릭 토글 버튼 그리드 / Multi-Select Menu)
  if (poll.options.length <= 20) {
    let currentBtnRow = new ActionRowBuilder<ButtonBuilder>();

    poll.options.forEach((opt, idx) => {
      const allMembers = optionVotesMap[opt.id] || [];
      const count = allMembers.length;
      const isFull = count >= 10;

      const btn = new ButtonBuilder()
        .setCustomId(`vote_${poll.id}_toggle_${opt.id}`)
        .setLabel(`${opt.label} (${count})`)
        .setStyle(
          isFull ? ButtonStyle.Primary : count > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary
        )
        .setDisabled(isClosed);

      if (isFull) {
        btn.setEmoji('⏳');
      }

      currentBtnRow.addComponents(btn);

      if (currentBtnRow.components.length === 5 || idx === poll.options.length - 1) {
        rows.push(currentBtnRow);
        currentBtnRow = new ActionRowBuilder<ButtonBuilder>();
      }
    });
  } else {
    // 20개 초과 시 Multi-Select Menu + 주요 15개 버튼 배치
    const voteSelectMenu = new StringSelectMenuBuilder()
      .setCustomId(`vote_${poll.id}_select`)
      .setPlaceholder('⏰ 참석 가능한 시간대 선택 (다중 선택 가능)')
      .setMinValues(1)
      .setMaxValues(poll.options.length)
      .setDisabled(isClosed);

    poll.options.forEach((opt) => {
      const allMembers = optionVotesMap[opt.id] || [];
      const mainCount = Math.min(allMembers.length, 10);
      const waitCount = Math.max(0, allMembers.length - 10);
      let label = `참석: ${opt.label} (${mainCount}/10명)`;
      if (allMembers.length >= 10) {
        label = `참석: ${opt.label} (10/10명 마감${waitCount > 0 ? ` | 대기 ${waitCount}명` : ''})`;
      }
      voteSelectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setValue(`vote_${poll.id}_attend_${opt.id}`)
          .setEmoji(allMembers.length >= 10 ? '⏳' : '⏰')
      );
    });

    const voteSelectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      voteSelectMenu
    );
    rows.push(voteSelectRow);

    let currentBtnRow = new ActionRowBuilder<ButtonBuilder>();
    const first15Options = poll.options.slice(0, 15);
    first15Options.forEach((opt, idx) => {
      const allMembers = optionVotesMap[opt.id] || [];
      const count = allMembers.length;
      const isFull = count >= 10;

      const btn = new ButtonBuilder()
        .setCustomId(`vote_${poll.id}_toggle_${opt.id}`)
        .setLabel(`${opt.label} (${count})`)
        .setStyle(
          isFull ? ButtonStyle.Primary : count > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary
        )
        .setDisabled(isClosed);

      if (isFull) {
        btn.setEmoji('⏳');
      }

      currentBtnRow.addComponents(btn);

      if (currentBtnRow.components.length === 5 || idx === first15Options.length - 1) {
        rows.push(currentBtnRow);
        currentBtnRow = new ActionRowBuilder<ButtonBuilder>();
      }
    });
  }

  return { embed, rows };
}
