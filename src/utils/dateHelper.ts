export interface ParsedDateInfo {
  formattedTitle: string; // 예: "8월 4일 (화)"
  isWeekend: boolean;
  dayOfWeekIndex: number; // 0=일, 1=월, ..., 6=토
  timeSlots: string[];
}

export function parseDateAndGetSlots(dateInput: string, startTimeOverride?: string | null): ParsedDateInfo {
  const now = new Date();
  let targetDate = new Date();

  const trimmed = dateInput.trim();

  if (trimmed === '오늘' || trimmed === 'today') {
    targetDate = now;
  } else if (trimmed === '내일' || trimmed === 'tomorrow') {
    targetDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  } else if (trimmed === '모레') {
    targetDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  } else {
    // 8/4, 8/04, 8월 4일, 08-04, 2026-08-04, 8.4 등 정규식 파싱
    const match = trimmed.match(/(?:(\d{4})[-.\/년\s]*)?(\d{1,2})[-.\/월\s]+(\d{1,2})일?/);
    if (match) {
      const year = match[1] ? parseInt(match[1], 10) : now.getFullYear();
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      targetDate = new Date(year, month, day);
    } else {
      const parsed = Date.parse(trimmed);
      if (!isNaN(parsed)) {
        targetDate = new Date(parsed);
      }
    }
  }

  const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeekIndex = targetDate.getDay(); // 0=일, 1=월, ..., 6=토
  const dayStr = daysOfWeek[dayOfWeekIndex];
  const isWeekend = dayOfWeekIndex === 0 || dayOfWeekIndex === 6;

  const monthStr = targetDate.getMonth() + 1;
  const dateStr = targetDate.getDate();
  const formattedTitle = `${monthStr}월 ${dateStr}일 (${dayStr})`;

  // 기본 시작 시간: 평일(월~금) = 17:00, 주말(토/일) = 13:00
  let startHour = isWeekend ? 13 : 17;
  let startMin = 0;

  if (startTimeOverride) {
    const timeMatch = startTimeOverride.match(/(\d{1,2}):?(\d{2})?/);
    if (timeMatch) {
      startHour = parseInt(timeMatch[1], 10);
      startMin = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    }
  }

  // 종료 시간 설정 (분 단위):
  // 토요일(6): 20:30까지 (20*60 + 30 = 1230분)
  // 평일(1~5) 및 일요일(0): 24:00까지 (24*60 = 1440분)
  let endMinutes = 24 * 60;
  if (dayOfWeekIndex === 6) {
    // 토요일
    endMinutes = 20 * 60 + 30; // 20:30까지 포함
  }

  let timeSlots: string[] = [];
  let currentMinutes = startHour * 60 + startMin;

  while (currentMinutes <= endMinutes) {
    const h = Math.floor(currentMinutes / 60);
    const m = currentMinutes % 60;
    const hStr = h < 10 ? `0${h}` : `${h}`;
    const mStr = m === 0 ? '00' : `${m}`;
    const slotLabel = `${hStr}:${mStr}`;
    timeSlots.push(slotLabel);
    currentMinutes += 30;
  }

  // 시간 예외 처리:
  // - 평일 (월~금, 1~5): 21:30, 22:00 시간 제외
  // - 일요일 (0): 21:30, 22:00 시간 제외
  if (dayOfWeekIndex !== 6) {
    timeSlots = timeSlots.filter((slot) => slot !== '21:30' && slot !== '22:00');
  }

  return {
    formattedTitle,
    isWeekend,
    dayOfWeekIndex,
    timeSlots,
  };
}
