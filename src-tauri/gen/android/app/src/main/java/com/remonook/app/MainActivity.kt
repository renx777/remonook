package com.remonook.app

import android.content.Context
import android.content.Intent
import android.webkit.WebView
import org.json.JSONObject
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.FileObserver
import java.io.File
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var studyWebView: WebView? = null
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.settings.userAgentString += " RemoAndroidAPI/"+android.os.Build.VERSION.SDK_INT
    studyWebView=webView
    deliverStudyLink()
  }
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    deliverStudyLink()
  }
  private fun deliverStudyLink(attempt:Int=0) {
    val uri=intent?.data ?: return
    if(uri.scheme!="remonook"||uri.host!="study"||attempt>=30)return
    val web=studyWebView ?: return
    web.postDelayed({
      val encoded=JSONObject.quote(uri.toString())
      web.evaluateJavascript("window.remoOpenWidgetStudy ? window.remoOpenWidgetStudy("+encoded+") : false") { result ->
        if(result=="true")intent.data=null else deliverStudyLink(attempt+1)
      }
    },500)
  }
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
