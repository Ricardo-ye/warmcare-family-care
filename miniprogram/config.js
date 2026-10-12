// 部署前请把 cloudEnv 改成你自己的微信云开发环境 ID。
// 仓库不包含真实环境标识：留空时 wx.cloud.init 不会连接，
// 登录页会显示配置错误（见 README「导入与配置」）。
module.exports = {
  mode: 'cloud',
  cloudEnv: '',
  functionName: 'warmcare',
  brand: '暖心夕护小助手',
  shortName: '暖心护',
};
