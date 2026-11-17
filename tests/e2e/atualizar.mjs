// "Procurar sempre ao abrir": no app de Windows (ponte simulada), confere atualização na abertura.
const PONTE = `window.vetraDesktop = { checkUpdate: async () => { localStorage.n = (+localStorage.n || 0) + 1; return { ok: true, temNova: false, atual: '0.0.0' }; },
  applyUpdate: async () => ({ ok: true }), onOpenFile(){}, ready(){}, openExternal(){} };`;

export default async ({ launch }) => {
  const t = await launch({ width: 1300, init: PONTE });
  await t.ev(`localStorage.clear(); localStorage.n = 0; return 1`);
  await t.reload();
  let r = await t.ev(`await until(() => +localStorage.n >= 1, 15000); return +localStorage.n;`);
  await t.check('desligada: a 1ª abertura do dia confere', r === 1, r);
  await t.reload();
  r = await t.ev(`const veio = await until(() => +localStorage.n >= 2, 10000); return { veio, n: +localStorage.n };`);
  await t.check('desligada: a 2ª abertura no mesmo dia não confere', !r.veio && r.n === 1, r);
  r = await t.ev(`$('#btnHelpMenu').click(); await until(() => !$('#helpMenu').hidden); btnT($('#helpMenu'), 'Procurar sempre ao abrir').click();
    await until(() => +localStorage.n >= 2, 5000); return { on: localStorage['le.updOnOpen'], n: +localStorage.n };`);
  await t.check('o item no menu Ajuda liga a opção e já confere', r.on === 'true' && r.n === 2, r);
  await t.reload();
  r = await t.ev(`await until(() => +localStorage.n >= 3, 10000); $('#btnHelpMenu').click(); await until(() => !$('#helpMenu').hidden);
    return { n: +localStorage.n, marcado: !!btnT($('#helpMenu'), 'Procurar sempre ao abrir')?.querySelector('.fmCheck.on') };`);
  await t.check('ligada: confere a cada abertura e o item aparece marcado', r.n === 3 && r.marcado, r);
  await t.close();
};
