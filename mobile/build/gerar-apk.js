// Gera o APK do Vetra com o Gradle do projeto Android (mobile/android).
// Acha o Java 21 e o Android SDK sozinho.
// - Sem mobile/assinatura.properties: APK de teste (assinado com a chave provisória de depuração deste PC).
// - Com ele: APK final, assinado com a sua chave. O arquivo só diz onde a chave está; a senha é pedida aqui,
//   na hora, sem aparecer na tela e sem ser gravada em lugar nenhum.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const AQUI = path.resolve(__dirname, '..'), ANDROID = path.join(AQUI, 'android');

// o Android pede Java 21: usa o JAVA_HOME só se ele já for 21 ou mais novo (o PC pode ter um Java 8 antigo configurado)
function java(){
  const env = process.env.JAVA_HOME;
  if (env && /jdk-?(2[1-9]|[3-9]\d)/i.test(env) && fs.existsSync(path.join(env, 'bin'))) return env;
  const base = 'C:\\Program Files\\Microsoft';
  const jdk = fs.existsSync(base) && fs.readdirSync(base).filter(d => /^jdk-2[1-9]/.test(d)).sort().pop();
  if (!jdk) throw new Error('Não achei o Java 21. Instale com: winget install Microsoft.OpenJDK.21');
  return path.join(base, jdk);
}
// o SDK fica em C:\Users\<você>\Android\Sdk (o lugar do Android Studio, em AppData\Local, também vale)
function sdk(){
  const opcoes = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, path.join(process.env.USERPROFILE || '', 'Android', 'Sdk'), path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk')].filter(Boolean);
  const s = opcoes.find(o => fs.existsSync(path.join(o, 'platforms')));
  if (!s) throw new Error('Não achei o Android SDK. Procurei em:\n  ' + opcoes.join('\n  '));
  return s;
}
// lê a senha no terminal sem mostrar o que é digitado
function pedirSenha(texto){
  return new Promise((ok, falha) => {
    const ent = process.stdin;
    if (!ent.isTTY) { falha(new Error('Rode "npm run apk" num terminal para digitar a senha da chave.')); return; }
    process.stdout.write(texto);
    let s = '';
    ent.setRawMode(true); ent.resume(); ent.setEncoding('utf8');
    const ler = c => {
      for (const ch of c) {
        if (ch === '\r' || ch === '\n') { ent.setRawMode(false); ent.pause(); ent.off('data', ler); process.stdout.write('\n'); ok(s); return; }
        if (ch === '\u0003') { ent.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u0008' || ch === '\u007f') s = s.slice(0, -1); else s += ch;
      }
    };
    ent.on('data', ler);
  });
}

(async () => {
  const SDK = sdk(), JAVA = java();
  fs.writeFileSync(path.join(ANDROID, 'local.properties'), `sdk.dir=${SDK.replace(/\\/g, '\\\\')}\n`);
  const pkg = require('../package.json');
  const assinado = fs.existsSync(path.join(AQUI, 'assinatura.properties'));
  const env = { ...process.env, JAVA_HOME: JAVA, ANDROID_HOME: SDK };
  if (assinado && !env.VETRA_ASSINATURA_SENHA) env.VETRA_ASSINATURA_SENHA = await pedirSenha('Senha da chave do Vetra: ');
  const tarefa = assinado ? 'assembleRelease' : 'assembleDebug';
  console.log(`Gerando o APK ${assinado ? 'final' : 'de teste'} do Vetra ${pkg.version}…`);
  // no Windows o gradlew é um .bat: roda pelo cmd.exe (o caminho vai entre aspas)
  const gradlew = path.join(ANDROID, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), args = [tarefa, '--console=plain', '-q'];
  const r = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `"${gradlew}" ${args.join(' ')}`], { cwd: ANDROID, stdio: 'inherit', env, windowsVerbatimArguments: true })
    : spawnSync(gradlew, args, { cwd: ANDROID, stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status || 1);
  const tipo = assinado ? 'release' : 'debug';
  const saida = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', tipo, `app-${tipo}.apk`);
  const destino = path.join(AQUI, 'dist', `Vetra-${pkg.version}${assinado ? '' : '-teste'}.apk`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(saida, destino);
  console.log(`APK pronto: ${destino} (${(fs.statSync(destino).size / 1e6).toFixed(1)} MB)`);
})().catch(e => { console.error(e.message); process.exit(1); });
