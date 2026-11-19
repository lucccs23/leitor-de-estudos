package app.vetra.leitor;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * PDFs e EPUBs que chegam de outros apps ("Abrir com" e "Compartilhar → Vetra").
 * O arquivo é copiado para o cache do app e o caminho vai para a página pelo evento "arquivo",
 * que fica guardado até a página começar a ouvir (o app pode estar abrindo naquele momento).
 */
@CapacitorPlugin(name = "VetraArquivos")
public class VetraArquivosPlugin extends Plugin {
    private static VetraArquivosPlugin atual;
    private static JSObject guardado;

    @Override
    public void load() {
        atual = this;
        if (guardado != null) { notifyListeners("arquivo", guardado, true); guardado = null; }
        receber(getActivity(), getActivity().getIntent());
    }

    static void receber(Activity activity, Intent intent) {
        if (activity == null || intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return;
        // não abre de novo o mesmo arquivo ao girar a tela ou voltar ao app
        activity.setIntent(new Intent(Intent.ACTION_MAIN));
        final Uri origem = uri;
        new Thread(() -> {
            JSObject dados = new JSObject();
            try {
                String nome = nomeDe(activity.getContentResolver(), origem);
                File pasta = new File(activity.getCacheDir(), "abertos");
                pasta.mkdirs();
                File destino = new File(pasta, System.currentTimeMillis() + "-" + nome.replaceAll("[\\\\/:*?\"<>|]", "-"));
                try (InputStream in = activity.getContentResolver().openInputStream(origem); OutputStream out = new FileOutputStream(destino)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                dados.put("path", destino.getAbsolutePath());
                dados.put("name", nome);
            } catch (Exception e) {
                dados.put("erro", String.valueOf(e.getMessage()));
            }
            activity.runOnUiThread(() -> {
                if (atual != null) atual.notifyListeners("arquivo", dados, true);
                else guardado = dados;
            });
        }).start();
    }

    private static String nomeDe(ContentResolver cr, Uri uri) {
        String nome = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor c = cr.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) nome = c.getString(0);
            } catch (Exception ignored) {}
        }
        if (nome == null) nome = uri.getLastPathSegment();
        if (nome == null || nome.isEmpty()) nome = "documento.pdf";
        String tipo = cr.getType(uri);
        if (!nome.toLowerCase().matches(".*\\.(pdf|epub)$")) nome += "application/epub+zip".equals(tipo) ? ".epub" : ".pdf";
        return nome;
    }
}
