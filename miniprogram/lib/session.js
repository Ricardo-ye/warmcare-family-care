// Clear in-memory private views before navigation; onUnload remains a second cleanup.
function clearPrivatePages(pages) {
  for (const page of pages) {
    try {
      if (page.onSessionInvalidated) page.onSessionInvalidated();
    } catch (e) {
      // A stopped audio device must not prevent removal of private page state.
    }
    page.state = null;
    page.setData({
      session: null,
      items: [],
      elders: [],
      alerts: [],
      active: [],
      history: [],
      contacts: [],
      recipientOptions: [],
      recipientIds: [],
      subjectOptions: [],
      pendingInvites: [],
      inviteElders: [],
      elderOptions: [],
      latest: null,
      query: '',
      relation: '',
      text: '',
      content: '',
      note: '',
      title: '',
      name: '',
      phone: '',
      token: '',
      id: '',
      draftPath: '',
      playingId: '',
      recording: false,
      composing: false,
      loading: false,
      error: '家庭身份已失效，请重新加入',
    });
  }
}
module.exports = { clearPrivatePages };
