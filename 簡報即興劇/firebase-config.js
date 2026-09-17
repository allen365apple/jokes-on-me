// Firebase 正式專案設定。
// room 是本專案在 Realtime Database 裡的獨立資料區，不使用原始 conte-affair 路徑。
window.SHOW_CONFIG = {
  mode: 'firebase',
  room: 'jokes-on-me-live-2026',
  // 夥伴只需輸入密碼；這是 Firebase Authentication 裡的共用後台帳號。
  adminEmail: 'stage-admin@jokes-on-me-3437e.firebaseapp.com',
  firebase: {
    apiKey: 'AIzaSyCUnLFHuELyzf4CuhdwcVsiDeTgMVDUFM8',
    authDomain: 'jokes-on-me-3437e.firebaseapp.com',
    databaseURL: 'https://jokes-on-me-3437e-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'jokes-on-me-3437e',
    storageBucket: 'jokes-on-me-3437e.firebasestorage.app',
    appId: '1:548684977248:web:bcac7fd0aa31e82cdadf05',
    measurementId: 'G-YMT4GHSENW',
  },
  submitUrl: '',
  qrImage: '',
};
