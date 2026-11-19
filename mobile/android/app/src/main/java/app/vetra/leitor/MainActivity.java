package app.vetra.leitor;

import android.content.Intent;
import android.os.Bundle;
import android.view.MotionEvent;
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

    // ---------- Botão lateral da S Pen ----------
    // O WebView nem sempre repassa o botão da caneta para a página. Aqui o app lê o botão direto do Android
    // (como o Samsung Notes) e avisa o Vetra: window.vetraSpenBotao(apertado, encostada).
    private boolean spenApertado = false;
    private static final int BOTOES_CANETA = MotionEvent.BUTTON_STYLUS_PRIMARY | MotionEvent.BUTTON_STYLUS_SECONDARY | MotionEvent.BUTTON_SECONDARY | MotionEvent.BUTTON_TERTIARY;

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        botaoDaCaneta(ev, true);
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        botaoDaCaneta(ev, false);
        return super.dispatchGenericMotionEvent(ev);
    }

    private void botaoDaCaneta(MotionEvent ev, boolean toque) {
        if (ev.getPointerCount() < 1) return;
        int tipo = ev.getToolType(0);
        if (tipo != MotionEvent.TOOL_TYPE_STYLUS && tipo != MotionEvent.TOOL_TYPE_ERASER) return;
        boolean apertado = (ev.getButtonState() & BOTOES_CANETA) != 0;
        int acao = ev.getActionMasked();
        // botão apertado/solto avisado pelo próprio evento (alguns aparelhos só mandam isto)
        if (acao == MotionEvent.ACTION_BUTTON_PRESS && (ev.getActionButton() & BOTOES_CANETA) != 0) apertado = true;
        if (acao == MotionEvent.ACTION_BUTTON_RELEASE && (ev.getActionButton() & BOTOES_CANETA) != 0) apertado = false;
        if (apertado == spenApertado) return;
        spenApertado = apertado;
        boolean encostada = toque && acao != MotionEvent.ACTION_UP && acao != MotionEvent.ACTION_CANCEL;
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript("window.vetraSpenBotao && window.vetraSpenBotao(" + apertado + "," + encostada + ")", null);
    }

    // o Vetra já estava aberto e recebeu outro PDF ("Abrir com" ou "Compartilhar")
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        VetraArquivosPlugin.receber(this, intent);
    }
}
