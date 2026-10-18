/* 相談フォーム（/contact/）と送信後の画面（/contact/thanks/）
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
  var sum = d.getElementById('cf-sum');
  var box = d.getElementById('cf-confirm');
  var dl = d.getElementById('cf-dl');
  var st = d.getElementById('cf-st');
  var sendBtn = d.getElementById('cf-send');
  var mailed = d.getElementById('cf-mailed');
  var t0 = Date.now();
  var KEY = 'cf-draft-v2';
  var ORDER = ['name', 'email', 'when', 'message', 'source', 'consent'];
  var LAB = { name: 'お名前', email: 'メールアドレス', when: 'ご希望の日時・時間帯', message: 'お話ししたいこと',
    source: '当事務所を知ったきっかけ', consent: '個人情報の取り扱いへの同意' };
  var FOCUS = { name: 'cf-name', email: 'cf-email', when: 'cf-when', message: 'cf-msg', source: null, consent: 'cf-consent' };
  var EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

  f.noValidate = true;
  var go = f.querySelector('.cf-go');
  if (go && go.getAttribute('data-js-label')) go.firstChild.nodeValue = go.getAttribute('data-js-label');

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
    if (k === 'message') return v.replace(/\r\n?/g, '\n').replace(/^\s+|\s+$/g, '');
    if (k === 'email') return nfkc(v).replace(/\s/g, '');
    return v.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function check(k) {
    var v = val(k);
    switch (k) {
      case 'name':
        if (!v) return 'お名前を入れてください。姓だけでも構いません。';
        if (v.length > 40) return 'お名前は40文字以内で入れてください。';
        if (/(https?:|www\.|:\/\/|<|>)/i.test(v)) return 'お名前には URL や記号（< >）を入れられません。';
        return '';
      case 'email':
        if (!v) return 'メールアドレスを入れてください。返信はこのアドレスにお送りします。';
        if (v.length > 254 || !EMAIL_RE.test(v)) return 'メールアドレスの形を確かめてください（例：name@example.com）。';
        return '';
      case 'consent': return v ? '' : '個人情報の取り扱いをお読みいただき、同意の欄にチェックを入れてください。';
      case 'when': return v.length > 100 ? 'ご希望の日時・時間帯は100文字以内でお願いします（いまは ' + v.length + ' 文字）。' : '';
      case 'message': return v.length > 2000 ? 'お話ししたいことは2,000文字以内でお願いします（いまは ' + v.length + ' 文字）。' : '';
      case 'source': return '';
    }
    return '';
  }

  function show(k, msg) {
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
    sum.innerHTML = '';
    var b = d.createElement('b'); b.textContent = '次の項目を確かめてください（' + keys.length + '件）。直し方は、各項目の下に出ています。'; sum.appendChild(b);
    var ul = d.createElement('ul');
    keys.forEach(function (k) {
      var li = d.createElement('li'), a = d.createElement('a');
      a.href = '#'; a.textContent = LAB[k];
      a.addEventListener('click', function (ev) { ev.preventDefault(); var x = firstInput(k); if (x) x.focus(); });
      li.appendChild(a); ul.appendChild(li);
    });
    sum.appendChild(ul);
    sum.hidden = false;
  }

  function validateAll() {
    var errs = {};
    ORDER.forEach(function (k) { var m = check(k); show(k, m); if (m) errs[k] = m; });
    return errs;
  }

  // 入力が終わったところ（離れたとき）で確かめる。いちど誤りを出した欄は、直したらすぐ消す
  var touched = {};
  ['name', 'email', 'when', 'message'].forEach(function (k) {
    var x = el(k);
    x.addEventListener('blur', function () { if (val(k) || touched[k]) { touched[k] = true; show(k, check(k)); } });
    x.addEventListener('input', function () { if (touched[k] && !check(k)) show(k, ''); });
  });
  ['source', 'consent'].forEach(function (k) {
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

  // 確認の画面
  function openConfirm() {
    dl.innerHTML = '';
    ORDER.forEach(function (k) {
      var v = val(k);
      if (!v) v = '記入なし';
      var dt = d.createElement('dt'), dd = d.createElement('dd');
      dt.textContent = LAB[k]; dd.textContent = v;
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
      b.type = 'button'; b.className = 'btn line'; b.textContent = 'メールで送る（記入内容を入れたメールを作る）';
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
    var keys = ORDER.filter(function (k) { return errs[k]; });
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
    ORDER.forEach(function (k) { body.append(k, val(k)); });
    body.append('cf_hp', el('cf_hp').value);
    body.append('el', String(Math.round((Date.now() - t0) / 1000)));
    body.append('via', 'js');
    body.append('page', location.href.slice(0, 300));
    body.append('ref', (d.referrer || '').slice(0, 300));
    busy(true);
    setStatus('送信しています。そのままお待ちください。', false);
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
    fetch(ep, { method: 'POST', body: body, redirect: 'follow', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) {
          clearDraft();
          location.href = thanks + (res.id ? '?n=' + encodeURIComponent(res.id) : '');
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
        setStatus('通信が途切れたため、送信できたかを確かめられませんでした。受付の確認メールが届いていなければ、もう一度送るか、下のボタンからメールでお送りください。', true, true);
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
    var lines = ['事務所サイトの相談フォームから、15分の無料相談を申し込みます。', ''];
    ORDER.forEach(function (k) {
      if (k === 'message') return;
      lines.push(LAB[k] + '：' + (val(k) || '記入なし'));
    });
    lines.push(LAB.message + '：');
    lines.push(val('message') || '記入なし');
    return lines.join('\n');
  }
  function openMail() {
    var subject = '【ご相談】' + val('name') + ' 様';
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
    function done(ok) { out.textContent = ok ? 'コピーしました。メールに貼り付けてお送りください。' : 'コピーできませんでした。本文を長押しして選び、コピーしてください。'; }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () { done(false); });
    } else {
      ta.focus(); ta.select();
      try { done(d.execCommand('copy')); } catch (e) { done(false); }
    }
  });
})();
