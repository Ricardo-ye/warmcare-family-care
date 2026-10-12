const family = require('../../lib/family'),
  ui = require('../../lib/ui'),
  { organize } = require('../../core/record-draft');
Page({
  data: {
    session: null,
    items: [],
    composing: false,
    draftReady: false,
    draftNotes: [],
    id: '',
    legacy: false,
    subjectIndex: 0,
    subjectOptions: [],
    date: ui.today(),
    content: '',
    categories: ['饮食起居', '生活备忘', '陪伴记录'],
    categoryIndex: 0,
    query: '',
    filter: 'all',
    busy: false,
    error: '',
    loading: true,
    limit: 30,
  },
  onShow() {
    ui.show(this);
    this.refresh();
  },
  onPullDownRefresh() {
    this.refresh();
  },
  refresh() {
    return ui.run(this, async () => this.applySession(await family.load()));
  },
  onFamilySnapshot(s) {
    this.applySession(family.decorate(s));
  },
  applySession(s) {
    this.setData({ session: s });
    this.render();
    if (this.data.composing) this.rebuildSubjectOptions();
  },
  rows() {
    const s = this.data.session;
    if (!s) return [];
    return [
      ...s.notebook.records.map((r) => ({
        ...r,
        legacy: true,
        subjectName: (s.notebook.elders.find((e) => e.id === r.elderId) || {}).name || '原有长辈',
        authorName: '原有记录',
        canEdit: s.me.role === 'guardian' || r.elderId === s.me.elderId,
      })),
      ...(s.familyRecords || []).map((r) => ({ ...r, legacy: false })),
    ];
  },
  render() {
    const q = this.data.query.trim();
    const rows = this.rows()
      .filter(
        (r) =>
          (this.data.filter !== 'mine' || r.authorId === this.data.session.me.id) &&
          (!q || (r.subjectName + ' ' + r.content + ' ' + r.category + ' ' + r.date).includes(q)),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    this.setData({
      items: rows.slice(0, this.data.limit),
      itemCount: Math.min(rows.length, this.data.limit),
      total: rows.length,
      hasMore: rows.length > this.data.limit,
    });
  },
  rebuildSubjectOptions() {
    const s = this.data.session,
      old = (this.data.subjectOptions[this.data.subjectIndex] || {}).id;
    const options = this.data.legacy
      ? s.notebook.elders.map((e) => ({ ...e }))
      : [{ id: '', name: '全家' }, ...s.members];
    const row = this.rows().find((r) => r.id === this.data.id);
    const selected =
      old === undefined ? (row ? (row.legacy ? row.elderId : row.subjectMemberId) : '') : old;
    if (selected && !options.some((x) => x.id === selected))
      options.push({ id: selected, name: ((row && row.subjectName) || '原成员') + '（已离开）' });
    this.setData({
      subjectOptions: options,
      subjectIndex: Math.max(
        0,
        options.findIndex((x) => x.id === selected),
      ),
    });
  },
  create() {
    if (this.data.content || this.data.id) {
      this.setData({ composing: true });
      return;
    }
    if (!(this.data.session.capabilities || []).includes('family-records')) {
      this.setData({ error: '云端尚未更新家庭记录功能，请先完成部署' });
      return;
    }
    this.setData({
      composing: true,
      draftReady: false,
      draftNotes: [],
      id: '',
      legacy: false,
      content: '',
      date: ui.today(),
      categoryIndex: 0,
      subjectOptions: [],
      subjectIndex: 0,
    });
    this.rebuildSubjectOptions();
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  back() {
    this.setData({ composing: false });
  },
  async edit(e) {
    if (this.data.id === e.currentTarget.dataset.id && this.data.content) {
      this.setData({ composing: true });
      this.rebuildSubjectOptions();
      return;
    }
    const row = this.rows().find((r) => r.id === e.currentTarget.dataset.id);
    if (!row || !row.canEdit) return;
    if (
      (this.data.content || this.data.id) &&
      this.data.id !== row.id &&
      !(await ui.confirm('当前有未保存的记录，放弃修改并打开这条记录？'))
    )
      return;
    this.setData({
      composing: true,
      draftReady: true,
      draftNotes: [],
      id: row.id,
      legacy: row.legacy,
      content: row.content,
      date: row.date,
      categoryIndex: Math.max(0, this.data.categories.indexOf(row.category)),
      subjectOptions: [],
      subjectIndex: 0,
    });
    this.rebuildSubjectOptions();
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  organize() {
    try {
      const d = organize(this.data.content, this.data.session.members, ui.today());
      this.setData({
        date: d.date,
        categoryIndex: this.data.categories.indexOf(d.category),
        subjectIndex: Math.max(
          0,
          this.data.subjectOptions.findIndex((m) => m.id === d.subjectMemberId),
        ),
        draftReady: true,
        draftNotes: d.notes,
        error: '',
      });
    } catch (e) {
      this.setData({ error: e.message });
    }
  },
  discard() {
    return ui.run(this, async () => {
      if (!(await ui.confirm('放弃本页尚未保存的修改？'))) return;
      this.setData({ composing: false, id: '', content: '', draftReady: false });
    });
  },
  input: ui.input,
  chooseSubject(e) {
    this.setData({ subjectIndex: Number(e.detail.value) });
  },
  chooseCategory(e) {
    this.setData({ categoryIndex: Number(e.detail.value) });
  },
  chooseDate(e) {
    this.setData({ date: e.detail.value });
  },
  search(e) {
    this.setData({ query: e.detail.value, limit: 30 });
    this.render();
  },
  filter(e) {
    this.setData({ filter: e.currentTarget.dataset.filter, limit: 30 });
    this.render();
  },
  more() {
    this.setData({ limit: this.data.limit + 30 });
    this.render();
  },
  save() {
    return ui.run(this, async () => {
      const d = this.data;
      if (!d.legacy && !d.draftReady) throw new Error('请先整理这句话并确认结果');
      const subject = d.subjectOptions[d.subjectIndex];
      if (!subject) throw new Error('请重新选择关联成员');
      const p = {
        id: d.id || undefined,
        date: d.date,
        category: d.categories[d.categoryIndex],
        content: d.content,
      };
      if (d.legacy)
        await family.act('notebook.apply', {
          action: { type: 'record.save', payload: { ...p, elderId: subject.id } },
        });
      else {
        if (!(d.session.capabilities || []).includes('family-records'))
          throw new Error('云端尚未更新，请先完成部署');
        await family.act('record.save', { ...p, subjectMemberId: subject.id });
      }
      this.setData({ composing: false, id: '', content: '' });
      this.applySession(await family.load());
      ui.toast('记录已保存');
    });
  },
  remove(e) {
    return ui.run(this, async () => {
      const row = this.rows().find((r) => r.id === e.currentTarget.dataset.id);
      if (!row || !row.canEdit) throw new Error('这条记录不可删除');
      if (!(await ui.confirm('删除这条生活记录？家庭内将无法继续查看。'))) return;
      if (row.legacy)
        await family.act('notebook.apply', {
          action: { type: 'record.delete', payload: { id: row.id } },
        });
      else await family.act('record.delete', { id: row.id });
      this.applySession(await family.load());
    });
  },
  go: ui.go,
});
