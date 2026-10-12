const api = require('../../lib/api'),
  ui = require('../../lib/ui');

const KIND = 'todos',
  SINGULAR = 'todo';
Page({
  data: {
    elders: [],
    items: [],
    elderIndex: 0,
    id: '',
    date: ui.today(),
    content: '',
    title: '',
    categories: ['饮食起居', '生活备忘', '陪伴记录'],
    categoryIndex: 0,
    query: '',
    filter: 'all',
    busy: false,
    error: '',
    loading: true,
  },
  onShow() {
    ui.show(this);
    this.refresh();
  },
  onPullDownRefresh() {
    this.refresh();
  },
  refresh() {
    return ui.run(this, async () => {
      this.state = await api.load(true);
      this.render();
      this.setData({ refreshRequired: false });
    });
  },
  render() {
    const s = this.state;
    let rows = ui.names(s, s[KIND]);
    if (KIND === 'todos')
      rows = rows
        .filter(
          (x) => this.data.filter === 'all' || (this.data.filter === 'done' ? x.done : !x.done),
        )
        .sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date));
    else rows = rows.sort((a, b) => b.date.localeCompare(a.date));
    const q = this.data.query.trim();
    if (q) rows = rows.filter((x) => (x.elderName + ' ' + (x.content || x.title)).includes(q));
    const total = rows.length;
    this.setData({
      elders: s.elders,
      elderCount: s.elders.length,
      itemCount: Math.min(rows.length, this.limit || 30),
      items: rows.slice(0, this.limit || 30),
      total,
      hasMore: total > (this.limit || 30),
      elderIndex: Math.min(this.data.elderIndex, Math.max(0, s.elders.length - 1)),
      today: ui.today(),
    });
  },
  input: ui.input,
  chooseElder(e) {
    this.setData({ elderIndex: Number(e.detail.value) });
  },
  chooseCategory(e) {
    this.setData({ categoryIndex: Number(e.detail.value) });
  },
  chooseDate(e) {
    this.setData({ date: e.detail.value });
  },
  search(e) {
    this.setData({ query: e.detail.value });
    this.limit = 30;
    if (this.state) this.render();
  },
  filter(e) {
    this.setData({ filter: e.currentTarget.dataset.value });
    this.limit = 30;
    if (this.state) this.render();
  },
  more() {
    this.limit = (this.limit || 30) + 30;
    this.render();
  },
  reset() {
    this.setData({ id: '', title: '', content: '', date: ui.today(), categoryIndex: 0 });
  },
  edit(e) {
    const row = this.state[KIND].find((x) => x.id === e.currentTarget.dataset.id);
    if (!row) return;
    this.setData({
      id: row.id,
      date: row.date,
      title: row.title || '',
      content: row.content || '',
      elderIndex: this.state.elders.findIndex((x) => x.id === row.elderId),
      categoryIndex: Math.max(0, this.data.categories.indexOf(row.category)),
    });
    wx.pageScrollTo({ scrollTop: 0 });
  },
  save() {
    return ui.run(this, async () => {
      if (this.data.refreshRequired) throw new Error('请先重新加载已保存的内容');
      const d = this.data,
        elder = d.elders[d.elderIndex];
      if (!elder) throw new Error('请先添加长辈资料');
      const p =
        KIND === 'records'
          ? {
              id: d.id || undefined,
              elderId: elder.id,
              date: d.date,
              category: d.categories[d.categoryIndex],
              content: d.content,
            }
          : { id: d.id || undefined, elderId: elder.id, date: d.date, title: d.title };
      this.state = await api.dispatch(SINGULAR + '.save', p, this.state.revision);
      this.reset();
      this.render();
      ui.toast('已保存');
    });
  },
  toggle(e) {
    const id = e.currentTarget.dataset.id;
    return ui.run(this, async () => {
      const row = this.state.todos.find((x) => x.id === id);
      this.state = await api.dispatch('todo.set', { id, done: !row.done }, this.state.revision);
      this.render();
    });
  },
  remove(e) {
    const id = e.currentTarget.dataset.id;
    return ui.run(this, async () => {
      if (!(await ui.confirm('确认删除这一条内容？'))) return;
      this.state = await api.dispatch(SINGULAR + '.delete', { id }, this.state.revision);
      if (this.data.id === id) this.reset();
      this.render();
    });
  },
  go: ui.go,
});
