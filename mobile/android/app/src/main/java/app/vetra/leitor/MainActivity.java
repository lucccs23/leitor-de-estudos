package app.vetra.leitor;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VetraArquivosPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // o Vetra já estava aberto e recebeu outro PDF ("Abrir com" ou "Compartilhar")
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        VetraArquivosPlugin.receber(this, intent);
    }
}
