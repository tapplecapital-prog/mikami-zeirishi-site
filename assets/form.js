/* 相談フォーム（/contact/）と送信後の画面（/contact/thanks/・/contact/thanks/quote/）
   2026-11-03：入口で手段を選ばせない形に作り直した。ご用件（topic）→ 状況 → 連絡先 → お返事の方法（reply）→ 同意 の順。
   ?topic=・&bucket=・&owner=・&reply= で、開いたときに選ばれた状態にできる。
   不動産の確定申告・顧問の状況を選ぶと、料金の目安（fees.json の表の行。計算はしない）を表示する。
   お返事の方法で「先に15分ほど話したい」を選んだときだけ、ご希望の日時の欄を出す。
   data-mode="post"：Google Apps Script の受け口へ送る。data-mode="mail"：記入内容を入れたメールの作成画面を開く。
   JavaScript が動かないときは、post はそのまま受け口へ送られ、mail はフォームを出さずにメールの案内を読んでもらう。 */
(function () {
  'use strict';
  var d = document;

  // 送信後の画面：受付番号を出す
  var rc = d.querySelector('[data-receipt]');
  if (rc) {
    var m = /[?&]n=([0-9A-Za-z\-]{6,40})(?:&|$)/.exec(location.search);
    if (m) { rc.querySelector('b').textContent = m[1]; rc.hidden = false; }
  }

  var f = d.getElementById('cf');
  if (!f) return;
  var mode = f.getAttribute('data-mode');
  var ep = f.getAttribute('data-endpoint');
  var MAIL = f.getAttribute('data-mail');
  var thanks = f.getAttribute('data-thanks');
  var thanksQuote = f.getAttribute('data-thanks-quote') || thanks;
  var sum = d.getElementById('cf-sum');
  var box = d.getElementById('cf-confirm');
  var dl = d.getElementById('cf-dl');
  var st = d.getElementById('cf-st');
  var sendBtn = d.getElementById('cf-send');
  var mailed = d.getElementById('cf-mailed');
  var t0 = Date.now();
  var KEY = 'cf-draft-v4';
  // 状況の欄は、用件によって使うものが違う（kakutei・komon＝不動産の状況、souzoku＝相続の状況。soudan・other は状況の欄なし）
  var FIELDS_RE = ['owner', 'bucket', 'units_kubun', 'units_itto', 'deal', 'est'];
  var FIELDS_SZ = ['s_when', 's_re'];
  var ORDER = ['topic', 'owner', 'bucket', 'units_kubun', 'units_itto', 'deal', 's_when', 's_re', 'est',
    'name', 'email', 'message', 'source', 'reply', 'when', 'consent'];
  var LAB = { topic: 'ご用件', owner: '申告する名義', bucket: 'お持ちの物件', units_kubun: '区分マンションの戸数',
    units_itto: '一棟の棟数', deal: '今年の物件の売買', s_when: '相続の状況', s_re: '財産に不動産があるか',
    est: '画面に出た料金の目安', name: 'お名前', email: 'メールアドレス', message: 'ご質問・状況',
    source: '当事務所を知ったきっかけ', reply: 'お返事の方法', when: 'ご希望の日時・時間帯',
    consent: '個人情報の取り扱いへの同意' };
  var FOCUS = { name: 'cf-name', email: 'cf-email', when: 'cf-when', message: 'cf-msg', units_kubun: 'cf-uk', units_itto: 'cf-ui', consent: 'cf-consent' };
  // URL で渡す値の別名（?bucket=1 など）。別名に無い値は、選択肢の文言そのものとして探す
  var ALIAS = {
    bucket: { '1': '区分マンション1戸', '2': '区分マンション2戸', '3': '区分マンション3戸、または一棟1棟', more: 'それ以上' },
    owner: { personal: '個人', corp: '資産管理法人', both: '個人と法人の両方' }
  };
  var FEES = {};
  try { FEES = JSON.parse((d.getElementById('fee-data') || {}).textContent || '{}'); } catch (e) { FEES = {}; }
  var EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

  f.noValidate = true;
  var go = f.querySelector('.cf-go');
  if (go && go.getAttribute('data-js-label')) go.firstChild.nodeValue = go.getAttribute('data-js-label');
  function isTalk() { return val('reply') === 'talk'; }
  // 今のご用件・お返事の方法で使う項目（状況の欄は用件ごと、日時の欄は「先に話したい」のときだけ）
  function applies(k) {
    var t = val('topic');
    if (FIELDS_RE.indexOf(k) >= 0) return t === 'kakutei' || t === 'komon';
    if (FIELDS_SZ.indexOf(k) >= 0) return t === 'souzoku';
    if (k === 'when') return isTalk();
    return true;
  }
  function active() { return ORDER.filter(applies); }
  function label(k) { return LAB[k]; }

  function nfkc(s) { s = String(s || ''); return s.normalize ? s.normalize('NFKC') : s; }
  function el(name) { return f.elements[name]; }
  function val(k) {
    var x = el(k);
    if (!x) return '';
    if (k === 'consent') return x.checked ? '同意する' : '';
    if (x.length && !x.tagName) { // ラジオボタンの組
      for (var i = 0; i < x.length; i++) if (x[i].checked) return x[i].value;
      return '';
    }
    var v = String(x.value || '');
    if (k === 'units_kubun' || k === 'units_itto') return nfkc(v).replace(/\s/g, '');
    if (k === 'message') return v.replace(/\r\n?/g, '\n').replace(/^\s+|\s+$/g, '');
    if (k === 'email') return nfkc(v).replace(/\s/g, '');
    return v.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }
  // 確認の画面・メールの本文に出す値。ご用件・お返事の方法は、送る記号ではなく画面の文言にする
  function disp(k) {
    var v = val(k);
    if (v && (k === 'topic' || k === 'reply')) {
      var x = el(k);
      for (var i = 0; i < x.length; i++) if (x[i].checked) { var b = x[i].parentNode.querySelector('b'); return b ? b.textContent : v; }
    }
    return v;
  }

  function check(k) {
    var v = val(k);
    switch (k) {
      case 'name':
        if (!v) return 'お名前を入れてください。';
        if (v.length > 40) return 'お名前は40文字以内で入れてください。';
        if (/(https?:|www\.|:\/\/|<|>)/i.test(v)) return 'お名前には URL や記号（< >）を入れられません。';
        return '';
      case 'email':
        if (!v) return 'メールアドレスを入れてください。';
        if (v.length > 254 || !EMAIL_RE.test(v)) return 'メールアドレスの形を確かめてください（例：name@example.com）。';
        return '';
      case 'consent': return v ? '' : '個人情報の取り扱いへの同意にチェックを入れてください。';
      case 'when': return v.length > 100 ? 'ご希望の日時・時間帯は100文字以内でお願いします（いまは ' + v.length + ' 文字）。' : '';
      case 'message': return v.length > 2000 ? 'ご質問・状況は2,000文字以内でお願いします（いまは ' + v.length + ' 文字）。' : '';
      case 'topic': return '';
      case 'reply': return v ? '' : 'お返事の方法を選んでください。';
      case 'units_kubun':
      case 'units_itto':
        if (!v) return '';
        return /^\d{1,2}$/.test(v) ? '' : '0から99までの数字で入れてください。';
      case 'source': return '';
    }
    return '';
  }

  function show(k, msg) {
    if (k === 'units_kubun' || k === 'units_itto') {
      if (!msg) msg = check(k === 'units_kubun' ? 'units_itto' : 'units_kubun');
      k = 'bucket';
    }
    var fld = f.querySelector('[data-f="' + k + '"]');
    var p = d.getElementById('cf-' + (k === 'message' ? 'msg' : k) + '-e');
    if (!fld || !p) return;
    fld.classList.toggle('err', !!msg);
    p.textContent = msg || '';
    p.hidden = !msg;
    var inputs = fld.querySelectorAll('input,textarea');
    for (var i = 0; i < inputs.length; i++) {
      if (msg) inputs[i].setAttribute('aria-invalid', 'true'); else inputs[i].removeAttribute('aria-invalid');
    }
  }

  function firstInput(k) {
    if (FOCUS[k]) return d.getElementById(FOCUS[k]);
    return f.querySelector('[data-f="' + k + '"] input');
  }

  function showSummary(errs) {
    var keys = ORDER.filter(function (k) { return errs[k]; });
    if (!keys.length) { sum.hidden = true; sum.innerHTML = ''; return; }
    keys = keys.filter(function (k) { return !(k === 'units_itto' && errs.units_kubun); });
    sum.innerHTML = '';
    var b = d.createElement('b'); b.textContent = '次の項目を確かめてください（' + keys.length + '件）。'; sum.appendChild(b);
    var ul = d.createElement('ul');
    keys.forEach(function (k) {
      var li = d.createElement('li'), a = d.createElement('a');
      a.href = '#'; a.textContent = (k === 'units_kubun' || k === 'units_itto') ? 'お持ちの物件（戸数・棟数）' : label(k);
      a.addEventListener('click', function (ev) { ev.preventDefault(); var x = firstInput(k); if (x) x.focus(); });
      li.appendChild(a); ul.appendChild(li);
    });
    sum.appendChild(ul);
    sum.hidden = false;
  }

  function validateAll() {
    var errs = {};
    active().forEach(function (k) { var m = check(k); show(k, m); if (m) errs[k] = m; });
    return errs;
  }

  // 入力が終わったところ（離れたとき）で確かめる。いちど誤りを出した欄は、直したらすぐ消す
  var touched = {};
  ['name', 'email', 'when', 'message'].forEach(function (k) {
    var x = el(k);
    x.addEventListener('blur', function () { if (val(k) || touched[k]) { touched[k] = true; show(k, check(k)); } });
    x.addEventListener('input', function () { if (touched[k] && !check(k)) show(k, ''); });
  });
  ['units_kubun', 'units_itto'].forEach(function (k) {
    var x = el(k);
    if (x) x.addEventListener('input', function () { show(k, check(k)); });
  });
  ['topic', 'reply', 'source', 'consent'].forEach(function (k) {
    var x = el(k), list = x.length && !x.tagName ? x : [x];
    for (var i = 0; i < list.length; i++) list[i].addEventListener('change', function () { show(k, check(k)); });
  });

  // 文字数の表示
  var msg = el('message'), cnt = d.getElementById('cf-msg-c');
  function count() { var n = msg.value.length; cnt.textContent = n.toLocaleString('ja-JP') + ' / 2,000文字'; cnt.classList.toggle('over', n > 2000); }
  msg.addEventListener('input', count);

  // 書きかけの内容を、このタブを閉じるまで残す（メールの作成画面から戻ったときなどのため）
  function save() {
    try {
      var o = {};
      ORDER.forEach(function (k) { o[k] = k === 'consent' ? !!el(k).checked : (k === 'message' ? el(k).value : val(k)); });
      sessionStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { /* 保存できない環境では何もしない */ }
  }
  function restore() {
    try {
      var o = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!o) return;
      ORDER.forEach(function (k) {
        var x = el(k);
        if (o[k] == null || !x) return;
        if (k === 'consent') { x.checked = !!o[k]; return; }
        if (x.length && !x.tagName) { for (var i = 0; i < x.length; i++) x[i].checked = x[i].value === o[k]; return; }
        x.value = o[k];
      });
    } catch (e) { /* 読めなければ空のまま */ }
  }
  function clearDraft() { try { sessionStorage.removeItem(KEY); } catch (e) { } }
  restore(); count();
  f.addEventListener('input', save);
  f.addEventListener('change', save);

  // ご用件・お返事の方法に合わせて、欄を出し入れする（欄を出し入れしても、カーソルの位置は動かさない）
  var estBox = d.getElementById('cf-est'), estOut = d.getElementById('cf-est-o');
  function estimate() {
    if (!estBox) return;
    var t = val('topic');
    var owner = val('owner'), bucket = val('bucket'), deal = val('deal');
    var corpOnly = owner === '資産管理法人';
    var both = owner === '個人と法人の両方';
    var bf = f.querySelector('[data-f="bucket"]');
    if (bf) bf.hidden = corpOnly;
    var more = f.querySelector('[data-only-more]');
    if (more) more.hidden = !(bucket === 'それ以上' && !corpOnly);
    var rows = [];
    // 確定申告のお問い合わせ＝パックの金額、顧問・法人化＝顧問の金額だけを出す
    var showPack = t !== 'komon', showAdv = t !== 'kakutei';
    if (corpOnly) showAdv = true;
    if (corpOnly) {
      if (showAdv && FEES.adv) rows.push(['顧問（法人）', FEES.adv['法人']]);
    } else if (FEES.pack && FEES.pack[bucket]) {
      if (showPack) rows.push(['確定申告パック', FEES.pack[bucket]]);
      if (showAdv) rows.push(['顧問', FEES.adv[bucket]]);
      if (bucket === 'それ以上') rows.push(['', FEES.more_note]);
      if (both && showAdv) rows.push(['', FEES.both_note]);
    }
    if (rows.length && FEES.deal && FEES.deal[deal]) rows.push(['', FEES.deal[deal]]);
    var shown = rows.length > 0;
    if (shown && FEES.confirm_note) rows.push(['', FEES.confirm_note]);
    estOut.innerHTML = '';
    var txt = [];
    rows.forEach(function (r) {
      var p = d.createElement('p');
      if (r[0]) {
        var b = d.createElement('b'); b.textContent = r[0];
        p.appendChild(b); p.appendChild(d.createTextNode(' ' + r[1]));
        txt.push(r[0] + ' ' + r[1]);
      } else { p.className = 'note'; p.textContent = r[1]; }
      estOut.appendChild(p);
    });
    estBox.hidden = !shown;
    if (el('est')) el('est').value = txt.join('／').slice(0, 200);
  }
  function applyState() {
    var t = val('topic');
    var xs = f.querySelectorAll('[data-topics]');
    for (var i = 0; i < xs.length; i++) xs[i].hidden = (' ' + xs[i].getAttribute('data-topics') + ' ').indexOf(' ' + t + ' ') < 0;
    var ws = f.querySelectorAll('[data-reply]');
    for (var j = 0; j < ws.length; j++) ws[j].hidden = ws[j].getAttribute('data-reply') !== val('reply');
    estimate();
  }
  f.addEventListener('change', function (ev) {
    if (ev.target && /^(topic|reply|owner|bucket|deal)$/.test(ev.target.name)) applyState();
  });
  // URL の ?topic= などで、開いたときに選ばれた状態にする（書きかけの内容より、リンクで渡された値を優先する）
  function setRadio(name, v) {
    var x = el(name);
    if (!x || !x.length) return;
    var want = (ALIAS[name] && ALIAS[name][v]) || v;
    for (var i = 0; i < x.length; i++) if (x[i].value === want) { x[i].checked = true; return; }
  }
  (function () {
    var q = location.search.replace(/^\?/, '').split('&');
    for (var i = 0; i < q.length; i++) {
      var kv = q[i].split('='), key = kv[0], v = '';
      try { v = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); } catch (e) { v = ''; }
      if (v && /^(topic|reply|owner|bucket)$/.test(key)) setRadio(key, v);
    }
  })();
  applyState();

  // 確認の画面
  function openConfirm() {
    dl.innerHTML = '';
    active().forEach(function (k) {
      var v = disp(k);
      if ((k === 'est' || k === 'units_kubun' || k === 'units_itto') && !v) return;
      if (!v) v = '記入なし';
      var dt = d.createElement('dt'), dd = d.createElement('dd');
      dt.textContent = label(k); dd.textContent = v;
      dl.appendChild(dt); dl.appendChild(dd);
    });
    setStatus('', false);
    f.hidden = true; box.hidden = false; mailed.hidden = true;
    box.scrollIntoView({ block: 'start' });
    box.focus({ preventScroll: true });
  }
  function backToForm(focusId) {
    box.hidden = true; mailed.hidden = true; f.hidden = false;
    var x = focusId ? d.getElementById(focusId) : go;
    f.scrollIntoView({ block: 'start' });
    if (x) x.focus({ preventScroll: true });
  }
  function setStatus(text, bad, withMail) {
    st.innerHTML = '';
    st.classList.toggle('bad', !!bad);
    if (!text) return;
    var p = d.createElement('p'); p.textContent = text; st.appendChild(p);
    if (withMail) {
      var b = d.createElement('button');
      b.type = 'button'; b.className = 'btn line'; b.textContent = 'メールで送る';
      b.style.marginTop = '12px';
      b.addEventListener('click', openMail);
      st.appendChild(b);
    }
  }
  function busy(on) {
    sendBtn.disabled = on;
    sendBtn.setAttribute('aria-busy', on ? 'true' : 'false');
    sendBtn.firstChild.nodeValue = on ? '送信しています…' : (mode === 'post' ? 'この内容で送信する' : 'メールを作成する');
  }

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var errs = validateAll();
    showSummary(errs);
    var keys = active().filter(function (k) { return errs[k]; });
    if (keys.length) {
      Object.keys(errs).forEach(function (k) { touched[k] = true; });
      sum.focus();
      return;
    }
    openConfirm();
  });
  d.getElementById('cf-back').addEventListener('click', function () { backToForm(); });
  d.getElementById('cf-edit').addEventListener('click', function () { backToForm(); });
  sendBtn.addEventListener('click', function () { if (mode === 'post') post(); else openMail(); });

  // 送信（Google Apps Script の受け口）
  function post() {
    if (!window.fetch || !window.URLSearchParams) { nativeSubmit(); return; }
    var body = new URLSearchParams();
    ORDER.forEach(function (k) { body.append(k, applies(k) ? val(k) : ''); });
    body.append('cf_hp', el('cf_hp').value);
    body.append('el', String(Math.round((Date.now() - t0) / 1000)));
    body.append('via', 'js');
    body.append('page', location.href.slice(0, 300));
    body.append('ref', (d.referrer || '').slice(0, 300));
    busy(true);
    setStatus('送信しています。', false);
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
    fetch(ep, { method: 'POST', body: body, redirect: 'follow', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) {
          clearDraft();
          location.href = (isTalk() ? thanks : thanksQuote) + (res.id ? '?n=' + encodeURIComponent(res.id) : '');
          return;
        }
        busy(false);
        if (res && res.code === 'invalid' && res.errors) {
          backToForm();
          Object.keys(res.errors).forEach(function (k) { show(k, res.errors[k]); touched[k] = true; });
          showSummary(res.errors);
          sum.focus();
          return;
        }
        setStatus((res && res.message) || '送信できませんでした。少し時間をおいて送り直すか、メール（' + MAIL + '）でお送りください。', true, true);
      })
      .catch(function () {
        clearTimeout(timer);
        busy(false);
        setStatus('通信が途切れ、送信できたか確認できませんでした。確認メールが届いていなければ、もう一度送るか、下のボタンからメールでお送りください。', true, true);
      });
  }
  function nativeSubmit() {
    el('el').value = String(Math.round((Date.now() - t0) / 1000));
    el('page').value = location.href.slice(0, 300);
    el('ref').value = (d.referrer || '').slice(0, 300);
    HTMLFormElement.prototype.submit.call(f);
  }

  // メールの作成画面を開く（送信先が無いあいだ、または送信に失敗したとき）
  function mailText() {
    var lines = [isTalk() ? '事務所サイトのフォームから、先に15分ほどお話しするご相談を申し込みます。' :
      '事務所サイトのフォームから、見積り・ご案内をメールで受け取りたいので申し込みます。', ''];
    active().forEach(function (k) {
      if (k === 'message') return;
      if ((k === 'est' || k === 'units_kubun' || k === 'units_itto') && !val(k)) return;
      lines.push(label(k) + '：' + (disp(k) || '記入なし'));
    });
    lines.push(label('message') + '：');
    lines.push(val('message') || '記入なし');
    return lines.join('\n');
  }
  function openMail() {
    var subject = (isTalk() ? '【ご相談】' : '【見積り・ご案内】') + disp('topic') + ' ' + val('name') + ' 様';
    var text = mailText();
    var url = 'mailto:' + MAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text.replace(/\n/g, '\r\n'));
    d.getElementById('cf-mailto').href = url;
    d.getElementById('cf-mailbody').value = '宛先：' + MAIL + '\n件名：' + subject + '\n\n' + text;
    d.getElementById('cf-copied').textContent = '';
    f.hidden = true; box.hidden = true; mailed.hidden = false;
    mailed.scrollIntoView({ block: 'start' });
    mailed.focus({ preventScroll: true });
    location.href = url;
  }
  d.getElementById('cf-copy').addEventListener('click', function () {
    var ta = d.getElementById('cf-mailbody'), out = d.getElementById('cf-copied');
    function done(ok) { out.textContent = ok ? 'コピーしました。' : 'コピーできませんでした。本文を長押しして選び、コピーしてください。'; }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () { done(false); });
    } else {
      ta.focus(); ta.select();
      try { done(d.execCommand('copy')); } catch (e) { done(false); }
    }
  });
})();
