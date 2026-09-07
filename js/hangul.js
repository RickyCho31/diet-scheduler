// 한글 초성 검색 유틸
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

export function choseong(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

export function isChoseongOnly(q) {
  return q.length > 0 && [...q].every((c) => CHO.includes(c));
}

export function norm(s) {
  return (s || '').replace(/\s+/g, '').toLowerCase();
}
