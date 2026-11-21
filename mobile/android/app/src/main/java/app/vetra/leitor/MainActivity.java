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
        // caneta encostando com o botão apertado: o WebView trataria como "selecionar texto" (atalho do Android)
        // e o traço não chegaria à página. Entrega o mesmo movimento sem o botão; o Vetra já sabe do botão
        // pelo aviso (window.vetraSpenBotao) e faz a ação de "segurar na tela".
        if (ev.getPointerCount() > 0 && ev.getToolType(0) == MotionEvent.TOOL_TYPE_STYLUS && (ev.getButtonState() & BOTOES_CANETA) != 0) {
            MotionEvent limpo = semBotao(ev);
            try { return super.dispatchTouchEvent(limpo); } finally { limpo.recycle(); }
        }
        return super.dispatchTouchEvent(ev);
    }

    // cópia do evento (com os pontos intermediários, para o traço continuar suave) sem os botões da caneta
    private static MotionEvent semBotao(MotionEvent ev) {
        int n = ev.getPointerCount(), h = ev.getHistorySize();
        MotionEvent.PointerProperties[] pp = new MotionEvent.PointerProperties[n];
        MotionEvent.PointerCoords[] pc = new MotionEvent.PointerCoords[n];
        for (int i = 0; i < n; i++) { pp[i] = new MotionEvent.PointerProperties(); ev.getPointerProperties(i, pp[i]); pc[i] = new MotionEvent.PointerCoords(); }
        MotionEvent out;
        if (h > 0) {
            for (int i = 0; i < n; i++) ev.getHistoricalPointerCoords(i, 0, pc[i]);
            out = MotionEvent.obtain(ev.getDownTime(), ev.getHistoricalEventTime(0), ev.getAction(), n, pp, pc, ev.getMetaState(), 0,
                ev.getXPrecision(), ev.getYPrecision(), ev.getDeviceId(), ev.getEdgeFlags(), ev.getSource(), ev.getFlags());
            for (int k = 1; k < h; k++) { for (int i = 0; i < n; i++) ev.getHistoricalPointerCoords(i, k, pc[i]); out.addBatch(ev.getHistoricalEventTime(k), pc, ev.getMetaState()); }
            for (int i = 0; i < n; i++) ev.getPointerCoords(i, pc[i]);
            out.addBatch(ev.getEventTime(), pc, ev.getMetaState());
        } else {
            for (int i = 0; i < n; i++) ev.getPointerCoords(i, pc[i]);
            out = MotionEvent.obtain(ev.getDownTime(), ev.getEventTime(), ev.getAction(), n, pp, pc, ev.getMetaState(), 0,
                ev.getXPrecision(), ev.getYPrecision(), ev.getDeviceId(), ev.getEdgeFlags(), ev.getSource(), ev.getFlags());
        }
        return out;
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        botaoDaCaneta(ev, false);
        // a caneta saiu do alcance da tela: o Vetra apaga o ponto da ponta (a página nem sempre fica sabendo)
        if (ev.getActionMasked() == MotionEvent.ACTION_HOVER_EXIT && ev.getPointerCount() > 0
                && ev.getToolType(0) == MotionEvent.TOOL_TYPE_STYLUS && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript("window.vetraSpenLonge && window.vetraSpenLonge()", null);
        }
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
