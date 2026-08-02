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

export function buildPollEmbedAndButtons(poll: FullPollData) {
  const isClosed = poll.status === 'CLOSED';

  // 옵션별 참석자 분류
  const optionVotesMap: Record<number, string[]> = {};
  poll.options.forEach((opt) => {
    optionVotesMap[opt.id] = [];
  });

  const absentList: string[] = [];
  const pendingList: string[] = [];

  poll.votes.forEach((vote) => {
    const mention = `<@${vote.userId}>`;
    if (vote.status === 'ATTEND' && vote.optionId && optionVotesMap[vote.optionId]) {
      // 중복 방지 (한 유저가 동일 옵션에 여러 번 카운트되지 않도록)
      if (!optionVotesMap[vote.optionId].includes(mention)) {
        optionVotesMap[vote.optionId].push(mention);
      }
    } else if (vote.status === 'ABSENT') {
      if (!absentList.includes(mention)) absentList.push(mention);
    } else if (vote.status === 'PENDING') {
      if (!pendingList.includes(mention)) pendingList.push(mention);
    }
  });

  // Embed 구성
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${poll.title}`)
    .setDescription(
      poll.description
        ? `${poll.description}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        : '아래 드롭다운에서 **가능한 시간대를 모두 체크(다중 선택)** 후 선택을 마치면 투표가 제출됩니다!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    )
    .setColor(isClosed ? 0x95a5a6 : 0x5865f2)
    .setTimestamp(poll.createdAt)
    .setFooter({
      text: isClosed
        ? '🔒 이 투표는 마감되었습니다.'
        : `투표 번호: #${poll.id} | 작성자: <@${poll.creatorId}>`,
    });

  // 참석 슬롯별 필드 추가
  let totalAttendSlots = 0;
  poll.options.forEach((opt) => {
    const members = optionVotesMap[opt.id] || [];
    totalAttendSlots += members.length;
    const memberText = members.length > 0 ? members.join(', ') : '_참석자 없음_';
    embed.addFields({
      name: `⏰ ${opt.label} (${members.length}명)`,
      value: memberText,
      inline: false,
    });
  });

  // 불참 및 미정 필드 추가
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

  // 다중 선택 고려한 유니크 참석 인원 계산
  const uniqueAttendingUsers = new Set<string>();
  poll.votes.forEach((v) => {
    if (v.status === 'ATTEND') uniqueAttendingUsers.add(v.userId);
  });

  // 총 참석 현황 요약
  embed.addFields({
    name: '📊 전체 요약',
    value: `참석 가능 인원 **${uniqueAttendingUsers.size}명** (총 ${totalAttendSlots}개 슬롯) | 불참 **${absentList.length}명** | 미정 **${pendingList.length}명**`,
    inline: false,
  });

  const rows: ActionRowBuilder<any>[] = [];

  // 다중 선택(Multi-Select) 지원 드롭다운 메뉴 생성
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`vote_${poll.id}_select`)
    .setPlaceholder('⏰ 참석 가능한 시간대를 모두 체크하세요 (다중 선택 가능)')
    .setMinValues(1)
    .setMaxValues(poll.options.length)
    .setDisabled(isClosed);

  poll.options.forEach((opt) => {
    const count = optionVotesMap[opt.id]?.length || 0;
    selectMenu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`참석: ${opt.label} (${count}명)`)
        .setValue(`vote_${poll.id}_attend_${opt.id}`)
        .setEmoji('⏰')
    );
  });

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  rows.push(selectRow);

  // 공통 하단 상태 버튼 (불참, 미정/대기, 현황 갱신)
  const statusRow = new ActionRowBuilder<ButtonBuilder>();

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

  statusRow.addComponents(absentBtn, pendingBtn, refreshBtn);
  rows.push(statusRow);

  return { embed, rows };
}
