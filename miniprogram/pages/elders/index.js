const api = require('../../lib/api'),
  ui = require('../../lib/ui');

Page({
  data: {
    elders: [],
    id: '',
    name: '',
    relation: '',
    note: '',
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
      const state = await api.load(true);
      this.setData({ elders: state.elders, revision: state.revision, refreshRequired: false });
    });
  },
  input: ui.input,
  edit(e) {
    const row = this.data.elders.find((x) => x.id === e.currentTarget.dataset.id);
    if (row) this.setData({ id: row.id, name: row.name, relation: row.relation, note: row.note });
    wx.pageScrollTo({ scrollTop: 0 });
  },
  reset() {
    this.setData({ id: '', name: '', relation: '', note: '' });
  },
  save() {
    return ui.run(this, async () => {
      if (this.data.refreshRequired) throw new Error('请先重新加载已保存的内容');
      const d = this.data,
        s = await api.dispatch(
          'elder.save',
          { id: d.id || undefined, name: d.name, relation: d.relation, note: d.note },
          this.data.revision,
        );
      this.setData({ elders: s.elders, revision: s.revision });
      this.reset();
      ui.toast('已保存');
    });
  },
  remove(e) {
    const id = e.currentTarget.dataset.id;
    return ui.run(this, async () => {
      if (!(await ui.confirm('删除这位长辈及其生活记录、待办事项？建议先在“我的”中导出备份。')))
        return;
      const s = await api.dispatch('elder.delete', { id }, this.data.revision);
      this.setData({ elders: s.elders, revision: s.revision });
      if (this.data.id === id) this.reset();
    });
  },
});
