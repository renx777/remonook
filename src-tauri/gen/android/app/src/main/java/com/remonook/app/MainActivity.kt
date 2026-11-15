package com.remonook.app

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.FileObserver
import java.io.File
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  // Local sync finds nearby devices with mDNS; Android drops multicast packets unless an app
  // holds this lock. Held only while the app is open.
  private var studyObserver: FileObserver? = null
  private var multicast: WifiManager.MulticastLock? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val studyDir=File(applicationInfo.dataDir,"remonook-study-widget").apply {mkdirs()}
    @Suppress("DEPRECATION")
    val observer=object:FileObserver(studyDir.absolutePath,FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO or FileObserver.DELETE) {
      override fun onEvent(event:Int,path:String?) {
        if(path=="snapshot.json")runOnUiThread {StudyWidgetProvider.refreshAll(this@MainActivity)}
      }
    }
    studyObserver=observer
    observer.startWatching()
    // The app draws edge to edge; keep RemoNook clear of the status bar, the navigation bar and
    // the on-screen keyboard (so the bullet being typed in stays visible).
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onResume() {
    super.onResume()
    StudyWidgetProvider.refreshAll(this)
    if (multicast == null) {
      val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      multicast = wifi?.createMulticastLock("remonook-local-sync")?.apply { setReferenceCounted(false); acquire() }
    }
  }

  override fun onDestroy() {
    studyObserver?.stopWatching()
    studyObserver=null
    super.onDestroy()
  }

  override fun onPause() {
    multicast?.release()
    multicast = null
    super.onPause()
  }
}
