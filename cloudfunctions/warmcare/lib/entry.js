const cloud = require('wx-server-sdk');
const { createFamilyService } = require('./lib/family');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const COLLECTION = 'family_private';
function adapter(db, client = db) {
  return {
    async read() {
      try {
        const result = await client.collection(COLLECTION).doc('family').get();
        if (!result.data) return null;
        const { _id, _openid, ...state } = result.data;
        return state;
      } catch (e) {
        const message = String(e.message || e.errMsg);
        if (
          !/collection/i.test(message) &&
          /document.*(?:not exist|does not exist)|DOCUMENT_NOT_EXIST/i.test(message)
        )
          return null;
        throw e;
      }
    },
    async write(state) {
      await client.collection(COLLECTION).doc('family').set({ data: state });
    },
    transaction(fn) {
      return db.runTransaction((tx) => fn(adapter(db, tx)));
    },
  };
}
function notificationConfig() {
  try {
    const fields = JSON.parse(process.env.SUBSCRIBE_FIELDS_JSON || 'null');
    return fields &&
      Object.keys(fields).length &&
      Object.values(fields).every((x) => ['title', 'sender', 'time'].includes(x))
      ? fields
      : null;
  } catch (e) {
    return null;
  }
}
function timeout(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })),
        7000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
exports.main = async (event) => {
  const config = {
    owner: process.env.OWNER_OPENID || '',
    appid: process.env.APPID || '',
    templateId: process.env.SUBSCRIBE_TEMPLATE_ID || '',
    templateFields: notificationConfig(),
  };
  const io = {
    log(event) {
      console.warn(JSON.stringify({ source: 'warmcare', ...event }));
    },
    async upload(buffer) {
      return (
        await cloud.uploadFile({
          cloudPath: 'family-private/' + require('crypto').randomBytes(24).toString('hex') + '.mp3',
          fileContent: buffer,
        })
      ).fileID;
    },
    async download(fileID) {
      return (await cloud.downloadFile({ fileID })).fileContent;
    },
    async delete(fileID) {
      const result = await cloud.deleteFile({ fileList: [fileID] });
      if (result.fileList && result.fileList.some((x) => x.status !== 0))
        throw new Error('file deletion incomplete');
    },
    async notify(openid, notice) {
      const data = {};
      for (const [key, semantic] of Object.entries(config.templateFields)) {
        let value =
          semantic === 'time'
            ? new Date(Date.parse(notice.time) + 8 * 3600000)
                .toISOString()
                .slice(0, 16)
                .replace('T', ' ')
            : notice[semantic];
        value = String(value || '');
        if (key.startsWith('thing')) value = value.slice(0, 20);
        else if (key.startsWith('name')) value = value.slice(0, 10);
        else if (key.startsWith('phrase')) value = value.slice(0, 5);
        data[key] = { value };
      }
      return timeout(
        cloud.openapi.subscribeMessage.send({
          touser: openid,
          templateId: config.templateId,
          data,
          page: notice.kind === 'sos' ? 'pages/sos/index' : 'pages/messages/index',
          miniprogramState: process.env.MINIPROGRAM_STATE || 'developer',
          lang: 'zh_CN',
        }),
      );
    },
  };
  return createFamilyService(
    adapter(cloud.database()),
    config,
    io,
  )(cloud.getWXContext(), event || {});
};
