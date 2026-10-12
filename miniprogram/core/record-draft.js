const { date: validDate } = require('./personal');
function organize(sentence, members, today) {
  const content = String(sentence || '').trim();
  if (!content || content.length > 1000) throw new Error('请写下1—1000字的生活小事');
  validDate(today);
  const notes = [];
  let date = today;
  const exact = content.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/);
  const short = content.match(/(?:^|[^\d])(\d{1,2})月(\d{1,2})日?/);
  if (exact || short) {
    const d = exact ? [exact[1], exact[2], exact[3]] : [today.slice(0, 4), short[1], short[2]];
    const candidate = d[0] + '-' + d[1].padStart(2, '0') + '-' + d[2].padStart(2, '0');
    try {
      date = validDate(candidate);
      if (!exact) notes.push('未写年份，暂按今年填写，请确认。');
    } catch (e) {
      notes.push('句中的日期无效，暂填今天，请修改。');
    }
  } else {
    const rel = [...new Set(content.match(/大前天|前天|昨天|今天|明天|后天/g) || [])],
      offsets = { 大前天: -3, 前天: -2, 昨天: -1, 今天: 0, 明天: 1, 后天: 2 };
    if (rel.length === 1) {
      date = new Date(Date.parse(today + 'T00:00:00Z') + offsets[rel[0]] * 86400000)
        .toISOString()
        .slice(0, 10);
    } else if (rel.length > 1) notes.push('提到了多个日期，暂填今天，请确认。');
    else notes.push('未识别到明确日期，暂填今天。');
  }
  const matches = members.filter((m) => m.name && content.includes(m.name));
  const subjectMemberId = matches.length === 1 ? matches[0].id : '';
  if (matches.length !== 1)
    notes.push(
      matches.length ? '提到多位或同名成员，暂关联全家。' : '未匹配到家庭成员称呼，暂关联全家。',
    );
  const categories = [
    ['饮食起居', /吃|饭|早餐|午餐|晚餐|喝|饮食|睡|午休|起床|洗澡/],
    ['陪伴记录', /陪|散步|聊天|一起|看望|探望|遛弯|逛|公园|游玩/],
  ].filter(([, rule]) => rule.test(content));
  const category = categories.length === 1 ? categories[0][0] : '生活备忘';
  if (categories.length !== 1)
    notes.push(
      categories.length ? '包含多类活动，暂归为生活备忘。' : '暂归为生活备忘，可自行修改分类。',
    );
  return { content, date, subjectMemberId, category, notes };
}
module.exports = { organize };
