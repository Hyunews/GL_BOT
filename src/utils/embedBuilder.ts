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

// 📢 공용 채널 메시지용 Embed & 버튼 생성 함수
export function buildPollEmbedAndButtons(
  poll: FullPollData,
  creatorDisplayName?: string
) {
  const isClosed = poll.status === 'CLOSED';

  // 옵션별 참석자 분류
  const optionVotesMap: Record<number, { userId: string; voteId: number }[]> = {};
  poll.options.forEach((opt) => {
    optionVotesMap[opt.id] = [];
  });

  const absentList: string[] = [];
  const pendingList: string[] = [];

  const sortedVotes = [...poll.votes].sort((a, b) => a.id - b.id);

  sortedVotes.forEach((vote) => {
    const mention = `<@${vote.userId}>`;
    if (vote.status === 'ATTEND' && vote.optionId && optionVotesMap[vote.optionId]) {
      if (!optionVotesMap[vote.optionId].some((v) => v.userId === vote.userId)) {
        optionVotesMap[vote.optionId].push({ userId: vote.userId, voteId: vote.id });
      }
    } else if (vote.status === 'ABSENT') {
      if (!absentList.includes(mention)) absentList.push(mention);
    } else if (vote.status === 'PENDING') {
      if (!pendingList.includes(mention)) pendingList.push(mention);
    }
  });

  const creatorName =
    creatorDisplayName ||
    poll.creatorDisplayName ||
    poll.votes.find((v) => v.userId === poll.creatorId)?.userDisplayName ||
    '관리자';

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${poll.title}`)
    .setDescription(
      poll.description
        ? `${poll.description}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        : '아래 **`🗳️ 내 참석 설정 & 명단 확인`** 버튼을 눌러 개별 참석 투표 및 명단을 확인하세요!\n*(시간대별 **최대 10명 선착순 참석**, 11번째부터는 **대기자**로 자동 등록됩니다)*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
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

  embed.addFields({
    name: '📊 전체 요약',
    value: `참석 확정 **${confirmedUserSet.size}명** (총 ${totalConfirmedSlots}개 슬롯)${
      waitlistUserSet.size > 0 ? ` | ⏳ 대기 **${waitlistUserSet.size}명**` : ''
    } | 불참 **${absentList.length}명** | 미정 **${pendingList.length}명**`,
    inline: false,
  });

  const rows: ActionRowBuilder<any>[] = [];

  const statusRow = new ActionRowBuilder<ButtonBuilder>();

  // 메인 개인 전용 설정 및 명단 패널 오픈 버튼
  const personalVoteBtn = new ButtonBuilder()
    .setCustomId(`vote_${poll.id}_open_panel`)
    .setLabel('🗳️ 내 참석 설정 & 명단 확인')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(isClosed);

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
    .setLabel('🟡 미정')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isClosed);

  const refreshBtn = new ButtonBuilder()
    .setCustomId(`vote_${poll.id}_refresh`)
    .setLabel('🔄 갱신')
    .setStyle(ButtonStyle.Secondary);

  statusRow.addComponents(personalVoteBtn, allAttendBtn, absentBtn, pendingBtn, refreshBtn);
  rows.push(statusRow);

  return { embed, rows };
}

// 🔒 사용자 개별 전용 에페메랄 투표 & 명단 패널 생성 함수 (나만 보는 팝업)
export function buildPersonalVotePanel(
  poll: FullPollData,
  userId: string,
  isExpanded: boolean = false
) {
  const isClosed = poll.status === 'CLOSED';

  // 내가 현재 선택한 ATTEND optionId 목록
  const userOptionIds = new Set<number>(
    poll.votes
      .filter((v) => v.userId === userId && v.status === 'ATTEND' && v.optionId !== null)
      .map((v) => v.optionId as number)
  );

  const optionVotesMap: Record<number, { userId: string }[]> = {};
  poll.options.forEach((opt) => {
    optionVotesMap[opt.id] = [];
  });
  const sortedVotes = [...poll.votes].sort((a, b) => a.id - b.id);
  sortedVotes.forEach((v) => {
    if (v.status === 'ATTEND' && v.optionId && optionVotesMap[v.optionId]) {
      if (!optionVotesMap[v.optionId].some((item) => item.userId === v.userId)) {
        optionVotesMap[v.optionId].push({ userId: v.userId });
      }
    }
  });

  const selectedLabels = poll.options
    .filter((o) => userOptionIds.has(o.id))
    .map((o) => o.label);

  const embed = new EmbedBuilder()
    .setTitle(`🗳️ ${poll.title} - 내 참석 설정 및 명단`)
    .setDescription(
      `*(본인에게만 보이는 개인 패널입니다)*\n` +
        `🔵 **파란색** = 내가 신청한 시간 | ⚪ **회색** = 미신청 시간\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏰ **내가 신청한 시간대**: ${
          selectedLabels.length > 0
            ? selectedLabels.map((l) => `\`${l}\``).join(', ')
            : '_선택된 시간 없음_'
        }`
    )
    .setColor(0x5865f2);

  if (isExpanded) {
    // 🔽 명단 펼침 모드: 개별 시간대별 상세 멘션 명단 표시
    poll.options.forEach((opt) => {
      const members = optionVotesMap[opt.id] || [];
      const mainRoster = members.slice(0, 10);
      const waitlist = members.slice(10);

      const mainText =
        mainRoster.length > 0
          ? mainRoster.map((m) => `<@${m.userId}>`).join(', ')
          : '_참석자 없음_';

      let fieldTitle = '';
      if (members.length >= 10) {
        fieldTitle = `⏰ ${opt.label} (10/10명 🔒 마감${
          waitlist.length > 0 ? ` | ⏳ 대기 ${waitlist.length}명` : ''
        })`;
      } else {
        fieldTitle = `⏰ ${opt.label} (${members.length}/10명)`;
      }

      let fieldValue = mainText;
      if (waitlist.length > 0) {
        const waitText = waitlist.map((m, idx) => `<@${m.userId}>(대기${idx + 1})`).join(', ');
        fieldValue += `\n> ⏳ **대기 명단**: ${waitText}`;
      }

      embed.addFields({
        name: fieldTitle,
        value: fieldValue,
        inline: false,
      });
    });
  } else {
    // 🔼 명단 접음 모드: 시간대별 인원 요약만 표시
    const slotSummaryLines: string[] = [];
    poll.options.forEach((opt) => {
      const members = optionVotesMap[opt.id] || [];
      if (members.length >= 10) {
        slotSummaryLines.push(`⏰ **${opt.label}** : **10/10명** 🔒 마감`);
      } else {
        slotSummaryLines.push(`⏰ **${opt.label}** : **${members.length}/10명**`);
      }
    });

    embed.addFields({
      name: '📊 시간대별 참석 현황 요약',
      value: slotSummaryLines.join('\n') || '_등록된 시간대가 없습니다._',
      inline: false,
    });
  }

  const rows: ActionRowBuilder<any>[] = [];

  // Row 0: 명단 펼치기/접기 (개인용) 및 닫기 버튼
  const statusRow = new ActionRowBuilder<ButtonBuilder>();

  const toggleExpandBtn = new ButtonBuilder()
    .setCustomId(`vote_${poll.id}_privatetoggleexpand_${isExpanded ? 'close' : 'open'}`)
    .setLabel(isExpanded ? '🔼 명단 접기' : '🔽 명단 펼치기')
    .setStyle(isExpanded ? ButtonStyle.Secondary : ButtonStyle.Primary);

  const closeBtn = new ButtonBuilder()
    .setCustomId(`vote_${poll.id}_close_private`)
    .setLabel('❌ 닫기')
    .setStyle(ButtonStyle.Secondary);

  statusRow.addComponents(toggleExpandBtn, closeBtn);
  rows.push(statusRow);

  // Row 1~4: 시간대 버튼 (내가 클릭한 시간 = Primary/파란색, 미클릭 시간 = Secondary/회색)
  let currentBtnRow = new ActionRowBuilder<ButtonBuilder>();
  poll.options.forEach((opt, idx) => {
    const isSelected = userOptionIds.has(opt.id);
    const count = (optionVotesMap[opt.id] || []).length;
    const isFull = count >= 10;

    const btn = new ButtonBuilder()
      .setCustomId(`vote_${poll.id}_toggle_${opt.id}`)
      .setLabel(`${isSelected ? '✅' : '⏰'} ${opt.label} (${count})`)
      .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(isClosed);

    if (isFull) {
      btn.setEmoji('⏳');
    }

    currentBtnRow.addComponents(btn);

    if (currentBtnRow.components.length === 5 || idx === poll.options.length - 1) {
      if (currentBtnRow.components.length > 0 && rows.length < 5) {
        rows.push(currentBtnRow);
      }
      currentBtnRow = new ActionRowBuilder<ButtonBuilder>();
    }
  });

  return { embed, rows: rows.slice(0, 5) };
}
