package app.vetra.leitor;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VetraArquivosPlugin.class);
        super.onCreate(savedInstanceState);
        // botão voltar do Android: primeiro o Vetra fecha o que estiver aberto (painel, livro, modo leitura, PDF);
        // só sai do app quando não há mais nada para fechar
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) { sair(this); return; }
                getBridge().getWebView().evaluateJavascript("(window.vetraVoltar && window.vetraVoltar()) ? 'sim' : 'nao'", resposta -> {
                    if (!"\"sim\"".equals(resposta)) sair(this);
                });
            }
        });
    }

    private void sair(OnBackPressedCallback cb) {
        cb.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        cb.setEnabled(true);
    }

    // o Vetra já estava aberto e recebeu outro PDF ("Abrir com" ou "Compartilhar")
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        VetraArquivosPlugin.receber(this, intent);
    }
}
