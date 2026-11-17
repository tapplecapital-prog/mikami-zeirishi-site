/* 金額の単位は万円。入力は画面内で扱い、相談を選んだときだけ結果の要約を渡す。 */
(function () {
  'use strict';

  const storageKey = 'valuation-consultation';
  const limit = 10000000;
  const purposes = {
    transaction: 'M&A・第三者間取引・増資',
    tax: '税務上の株価算定',
    property: '不動産保有法人の株価・出口比較',
    modeling: '財務モデルの作成',
    special: 'SO・種類株式・PPA・裁判',
  };
  const sizes = { small: '小規模', medium: '中規模', large: '大規模' };
  const services = {
    transaction: ['株価レンジ試算・企業価値評価', 'stock-valuation'],
    tax: ['非上場株式の簡易試算・特定会社診断', 'tax-valuation'],
    property: ['不動産保有法人の株価・税務時価の評価', 'real-estate-corp'],
    modeling: ['長期CF・DCF前提モデル', 'financial-modeling'],
    special: ['目的別の評価・意見書', 'pricing'],
  };

  function isAmount(value) {
    return Number.isFinite(value) && Math.abs(value) <= limit;
  }

  function evaluateValuation(input) {
    const { purpose, size, revenue, profit, bookEquity, propertyGain, netDebt } = input;
    if (!Object.hasOwn(purposes, purpose) || !Object.hasOwn(sizes, size) ||
        ![revenue, profit, bookEquity, propertyGain].every(isAmount) || revenue < 0 ||
        (netDebt !== null && !isAmount(netDebt))) {
      return null;
    }
    const adjustedEquity = bookEquity + propertyGain;
    const result = {
      adjustedEquity, range: null, enterpriseRange: null,
      method: '', reason: '', rangeLabel: '株式価値の概算（万円）',
      service: services[purpose][0], serviceSlug: services[purpose][1],
    };
    if (purpose === 'transaction' && size === 'large') {
      result.service = '正式な株価算定・企業価値評価報告書';
    }
    if (purpose === 'transaction' && profit > 0) {
      result.method = '営業利益倍率法で初期レンジを比較';
      result.enterpriseRange = [profit * 3, profit * 5];
      result.range = netDebt === null ? null : result.enterpriseRange.map(v => v - netDebt);
      result.reason = '営業利益の3倍・5倍を仮定しています。比較企業から観測した倍率ではありません。' +
        (netDebt === null ? '純有利子負債を入力すると、株式価値の目安も表示します。' : '事業価値から純有利子負債を引いた金額です。');
    } else if (purpose === 'transaction') {
      result.method = '修正純資産法と将来キャッシュフローから検討';
      result.reason = '営業利益が0以下のため、倍率でのレンジは表示しません。設備投資、収益回復の見込み、資産と負債の時価を確認します。';
    } else if (purpose === 'property') {
      const movement = Math.abs(propertyGain) * 0.1;
      result.method = '修正純資産法と売却時の手取り比較';
      result.range = [adjustedEquity - movement, adjustedEquity + movement];
      result.rangeLabel = '不動産の含み損益を動かした場合の株式価値（万円）';
      result.reason = '不動産の含み損益を入力値の上下10％分だけ振った感応度です。税効果、売却費用や他の資産の時価修正は含みません。';
    } else {
      const diagnostic = {
        tax: ['株主区分・会社規模・特定会社の判定', '相続、贈与、同族間売買で適用根拠が異なります。株主構成や申告・評価資料が必要なため、税務上の株価レンジは表示しません。'],
        modeling: ['前提表とキャッシュフローの作成', '将来の賃料・費用・借入条件をそろえると、資金繰りや投資案を比較できます。株式価値を出すには将来計画と割引率が必要です。'],
        special: ['目的別の手法選定', '株式の権利、評価基準日、手続、第三者性によって必要資料が変わります。ここでは手法選定の入口までを案内します。'],
      };
      [result.method, result.reason] = diagnostic[purpose];
    }
    return result;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { evaluateValuation };
    return;
  }

  const form = document.getElementById('valuation-simulator');
  if (!form) return;
  const panel = document.getElementById('valuation-result');
  const output = document.getElementById('valuation-result-data');
  const contact = document.getElementById('valuation-contact');
  const service = document.getElementById('valuation-result-service');
  const status = document.getElementById('valuation-storage-status');
  const format = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });
  const money = amount => format.format(amount);
  const band = ([low, high]) => money(low) + ' 〜 ' + money(high);

  function appendResult(label, value) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    output.append(term, description);
  }

  let consultation = '';
  function clearResult() {
    consultation = '';
    output.replaceChildren();
    status.textContent = '';
    panel.hidden = true;
  }

  form.addEventListener('input', clearResult);
  form.addEventListener('reset', clearResult);
  form.addEventListener('submit', event => {
    event.preventDefault();
    clearResult();
    const input = { purpose: form.elements.purpose.value, size: form.elements.size.value };
    for (const name of ['revenue', 'profit', 'bookEquity', 'propertyGain', 'netDebt']) {
      const control = form.elements[name];
      input[name] = control.value === '' ? null : control.valueAsNumber;
    }
    const result = evaluateValuation(input);
    if (!result) return;

    appendResult('検討する手法', result.method);
    if (result.range) appendResult(result.rangeLabel, band(result.range));
    if (result.enterpriseRange) appendResult('事業価値の概算（万円）', band(result.enterpriseRange));
    if (input.revenue > 0) appendResult('直近1期の営業利益率', money(input.profit / input.revenue * 100) + '％');
    if (!result.enterpriseRange) {
      appendResult('帳簿純資産＋不動産の含み損益（万円）', money(result.adjustedEquity));
    }
    appendResult('計算の前提', result.reason);
    appendResult('相談メニューの目安', result.service);
    service.href = form.dataset.servicesBase + result.serviceSlug + '/';
    service.textContent = result.service + 'の詳細';
    consultation = [`株価算定・財務モデリングのご相談（${purposes[input.purpose]}）`,
      `会社規模の自己申告：${sizes[input.size]}`, `検討手法：${result.method}`,
      result.range ? `${result.rangeLabel}：${band(result.range)}` : '',
      result.enterpriseRange ? `事業価値の概算（万円）：${band(result.enterpriseRange)}` : '',
      `相談メニュー：${result.service}`].filter(Boolean).join('\n');
    panel.hidden = false;
    panel.focus();
  });

  contact.addEventListener('click', event => {
    if (!consultation) {
      event.preventDefault();
      return;
    }
    try {
      sessionStorage.setItem(storageKey, consultation);
    } catch (error) {
      event.preventDefault();
      status.textContent = 'ブラウザの設定により結果を引き継げません。結果を控えてから、ページ下部の相談ボタンをお使いください。';
    }
  });
  form.hidden = false;
}());
