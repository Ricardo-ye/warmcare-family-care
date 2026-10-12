const VERSION = 1;
function empty() {
  return { schemaVersion: VERSION, revision: 0, elders: [], records: [], todos: [], receipts: [] };
}
function need(ok, message) {
  if (!ok) throw new Error(message);
}
function text(v, max, label, optional = false) {
  need(typeof v === 'string', label + '格式不正确');
  const s = v.trim();
  need(
    (optional || s.length > 0) && s.length <= max,
    label + '请填写' + (optional ? '0' : '1') + '—' + max + '字',
  );
  return s;
}
function date(v) {
  need(/^\d{4}-\d{2}-\d{2}$/.test(v || ''), '请选择有效日期');
  const d = new Date(v + 'T00:00:00Z');
  need(Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v, '日期不存在');
  return v;
}
// Retry checksum only, never authentication. Receipts retain no record text.
function checksum(value) {
  let a = 2166136261,
    b = 3339675911;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b ^ value.charCodeAt(i), 2246822519);
  }
  return (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16) + ':' + value.length;
}
function apply(current, action, now = new Date()) {
  need(current.schemaVersion === VERSION, '记录版本不支持，请先导出备份');
  need(action && /^[a-zA-Z0-9_-]{16,100}$/.test(action.id || ''), '操作编号无效');
  const p = action.payload || {},
    fingerprint = checksum(JSON.stringify([action.type, p]));
  const previous = current.receipts.find((r) => r.id === action.id);
  if (previous) {
    need(previous.fingerprint === fingerprint, '操作编号重复，请重新打开页面');
    return current;
  }
  need(JSON.stringify(p).length <= 6000, '输入内容过长');
  const s = JSON.parse(JSON.stringify(current)),
    at = now.toISOString();
  function elder(id) {
    need(
      s.elders.some((x) => x.id === id),
      '请先添加或重新选择长辈',
    );
  }
  function find(rows, id) {
    const row = rows.find((x) => x.id === id);
    need(row, '这条记录已不存在，请刷新');
    return row;
  }
  switch (action.type) {
    case 'elder.save': {
      const row = {
        id: p.id || action.id,
        name: text(p.name, 30, '称呼'),
        relation: text(p.relation || '', 30, '关系', true),
        note: text(p.note || '', 300, '生活备注', true),
        updatedAt: at,
      };
      if (p.id) {
        find(s.elders, p.id);
        s.elders = s.elders.map((x) => (x.id === p.id ? row : x));
      } else {
        need(s.elders.length < 20, '最多保存20位长辈');
        s.elders.push(row);
      }
      break;
    }
    case 'elder.delete':
      find(s.elders, p.id);
      s.elders = s.elders.filter((x) => x.id !== p.id);
      s.records = s.records.filter((x) => x.elderId !== p.id);
      s.todos = s.todos.filter((x) => x.elderId !== p.id);
      break;
    case 'record.save': {
      elder(p.elderId);
      need(['饮食起居', '生活备忘', '陪伴记录'].includes(p.category), '记录分类无效');
      const old = p.id ? find(s.records, p.id) : null;
      const row = {
        id: p.id || action.id,
        elderId: p.elderId,
        category: p.category,
        date: date(p.date),
        content: text(p.content, 1000, '记录内容'),
        createdAt: old ? old.createdAt : at,
        updatedAt: at,
      };
      if (p.id) s.records = s.records.map((x) => (x.id === p.id ? row : x));
      else {
        need(s.records.length < 1000, '记录数量已达1000条，请先导出并整理旧记录');
        s.records.unshift(row);
      }
      break;
    }
    case 'record.delete':
      find(s.records, p.id);
      s.records = s.records.filter((x) => x.id !== p.id);
      break;
    case 'todo.save': {
      elder(p.elderId);
      const old = p.id ? find(s.todos, p.id) : null;
      const row = {
        id: p.id || action.id,
        elderId: p.elderId,
        title: text(p.title, 100, '待办事项'),
        date: date(p.date),
        done: old ? old.done : false,
        createdAt: old ? old.createdAt : at,
      };
      if (p.id) s.todos = s.todos.map((x) => (x.id === p.id ? row : x));
      else {
        need(s.todos.length < 500, '待办数量已达500条，请先整理旧事项');
        s.todos.unshift(row);
      }
      break;
    }
    case 'todo.set': {
      const row = find(s.todos, p.id);
      need(typeof p.done === 'boolean', '完成状态无效');
      row.done = p.done;
      break;
    }
    case 'todo.delete':
      find(s.todos, p.id);
      s.todos = s.todos.filter((x) => x.id !== p.id);
      break;
    case 'clear':
      need(p.confirm === 'CLEAR_MY_RECORDS', '请确认清空本人记录');
      s.elders = [];
      s.records = [];
      s.todos = [];
      s.receipts = [];
      break;
    default:
      throw new Error('不支持的操作');
  }
  s.revision += 1;
  s.receipts.push({ id: action.id, fingerprint });
  s.receipts = s.receipts.slice(-100);
  need(JSON.stringify(s).length < 180000, '记录空间接近上限，请先导出并整理旧记录');
  return s;
}
module.exports = { empty, apply, date };
