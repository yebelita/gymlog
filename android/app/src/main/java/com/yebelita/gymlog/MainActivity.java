package com.yebelita.gymlog;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createRestChannels();
    }

    /**
     * Canales de los avisos de fin de descanso. Se crean aquí y no desde JavaScript porque el plugin de notificaciones
     * no permite elegir el tipo de audio: con USAGE_ALARM el aviso suena aunque el móvil esté en vibración o silencio,
     * y por el altavoz y los auriculares conectados (volumen de alarma, no el de notificaciones).
     * Hay un canal por cada combinación de los interruptores de sonido y vibración de Ajustes; la JS elige cuál usar
     * (restChannel() en index.html). El sonido de un canal no se puede cambiar después: para cambiarlo hay que usar otro id.
     */
    private void createRestChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        nm.deleteNotificationChannel("descanso"); // canal de la primera prueba (sonaba como notificación, no como alarma)

        AudioAttributes alarm = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        Uri sound = Settings.System.DEFAULT_NOTIFICATION_URI;

        createRestChannel(nm, "descanso-sv", "Fin de descanso (sonido y vibración)", true, true, sound, alarm);
        createRestChannel(nm, "descanso-s", "Fin de descanso (solo sonido)", true, false, sound, alarm);
        createRestChannel(nm, "descanso-v", "Fin de descanso (solo vibración)", false, true, sound, alarm);
        createRestChannel(nm, "descanso-n", "Fin de descanso (silencioso)", false, false, sound, alarm);
    }

    private void createRestChannel(NotificationManager nm, String id, String name, boolean withSound, boolean withVibration,
                                   Uri sound, AudioAttributes alarm) {
        NotificationChannel ch = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Avisa cuando termina el descanso entre series");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        if (withSound) ch.setSound(sound, alarm);
        else ch.setSound(null, null);
        ch.enableVibration(withVibration);
        if (withVibration) ch.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
        nm.createNotificationChannel(ch);
    }
}
