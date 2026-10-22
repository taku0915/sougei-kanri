(function () {
  'use strict';
  const money = value => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
  const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const work = row => (row.work || row.store) === 'キッチン' ? '愛' : (row.work || row.store || '未分類');
  const gross = row => amount(row.grossAmount ?? row.amount);
  const net = row => work(row) === '愛' && ['grossAmount', 'withholdingTax', 'otherDeduction'].some(key => key in row)
    ? Math.max(0, gross(row) - amount(row.withholdingTax) - amount(row.otherDeduction)) : amount(row.amount);

  function buildReport(entries, expenses, month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('対象月を選んでください。');
    const valid = rows => rows.filter(row => row && typeof row === 'object' && !Array.isArray(row));
    const selected = rows => valid(rows).filter(row => typeof row.date === 'string' && row.date.slice(0, 7) === month);
    const incomes = selected(entries), costs = selected(expenses);
    if (!incomes.length && !costs.length) throw new Error('この月の記録はありません。');
    const sum = (rows, fn) => rows.reduce((total, row) => total + fn(row), 0);
    const received = sum(incomes, net), spent = sum(costs, row => amount(row.amount));
    function grouped(rows, key, value) {
      const groups = new Map();
      for (const row of rows) groups.set(key(row), (groups.get(key(row)) || 0) + value(row));
      return [...groups].map(([name, total]) => `${String(name).replace(/[\r\n]/g, ' ')}：${money(total)}`);
    }
    return [
      '裏帳簿の収支について相談します。以下の集計データをもとに、収入と支出の特徴、確認したい点、改善案を日本語で説明してください。',
      '記録されていない支出や銀行残高は推測せず、収支をそのまま貯金額や税引後所得と扱わないでください。',
      '', '【集計データ】', `対象月：${month}`, 'この端末に入力した記録のみ。月途中や未入力の可能性があります。',
      `記録件数：収入 ${incomes.length}件／支出 ${costs.length}件`,
      `総支給ベースの収入合計：${money(sum(incomes, gross))}`,
      `控除合計：${money(sum(incomes, row => amount(row.withholdingTax) + amount(row.otherDeduction)))}`,
      `実受取ベースの収入合計：${money(received)}`, `支出合計：${money(spent)}`, `記録上の収支：${money(received - spent)}`,
      '', '【収入先別・実受取ベース】', ...grouped(incomes, work, net),
      '', '【支出カテゴリー別】', ...(costs.length ? grouped(costs, row => row.category || '未分類', row => amount(row.amount)) : ['記録なし']),
      '', 'メモ・支払先・個別の明細は含めていません。これは手動で渡した集計で、自動連携ではありません。'
    ].join('\n');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildReport };
  if (typeof document === 'undefined') return;
  const el = id => document.getElementById(id);
  function report() {
    function read(key) {
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(data)) throw new Error('保存データを読み込めませんでした。');
      return data;
    }
    return buildReport(read('sougeiEntries'), read('sougeiExpenses'), el('chatgptMonth').value);
  }
  function status(text) { el('chatgptStatus').textContent = text; }
  function prepare() {
    el('chatgptPreview').value = '';
    try { el('chatgptPreview').value = report(); status('内容を確認して、コピーかTXT保存を選んでください。'); }
    catch (error) { status(error.message); }
  }
  const today = new Date();
  el('chatgptMonth').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  el('chatgptMonth').onchange = () => { el('chatgptPreview').value = ''; status('対象月を変更しました。「相談文を作る」を押してください。'); };
  el('chatgptPrepare').onclick = prepare;
  el('chatgptCopy').onclick = async () => {
    el('chatgptPreview').value = '';
    try {
      const text = report();
      el('chatgptPreview').value = text;
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      status('コピーしました。ChatGPTを開いて貼り付けてください。');
    } catch (error) {
      if (el('chatgptPreview').value) {
        el('chatgptPreview').focus(); el('chatgptPreview').select();
        status('自動コピーできませんでした。下の相談文を長押ししてコピーするか、TXT保存を使ってください。');
      } else status(error.message);
    }
  };
  el('chatgptDownload').onclick = () => {
    el('chatgptPreview').value = '';
    try {
      const text = report(); el('chatgptPreview').value = text;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `urachoubo-chatgpt-${el('chatgptMonth').value}.txt`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('TXTを保存しました。ChatGPTに添付して相談できます。');
    } catch (error) { status(error.message); }
  };
})();
