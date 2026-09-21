/** Recover the legacy course-name parser's weekday-only labels without changing stored evidence. */
export function displaySportName(sportName: string | null, creditType: string, courseName: string): string | null {
  if (creditType !== 'COURSE_RELATED' || !sportName || !/^(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|周[一二三四五六日天]|星期[一二三四五六日天])$/i.test(sportName.trim())) return sportName;
  return courseName.replace(/[（(][^（）()]*[）)]\s*\d*\s*$/, '').trim() || sportName;
}
