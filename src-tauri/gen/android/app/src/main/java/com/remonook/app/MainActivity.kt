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
  private var widgetDeliveryId=""
  private fun deliverStudyLink(attempt:Int=0) {
    val uri=intent?.data ?: return
    if(uri.scheme!="remonook"||uri.host !in listOf("study","capture","focus","note","today")||attempt>=60)return
    val web=studyWebView ?: return
    if(attempt==0)widgetDeliveryId=java.util.UUID.randomUUID().toString()
    val delivery=widgetDeliveryId
    web.postDelayed({
      if(intent?.data!=uri||delivery!=widgetDeliveryId)return@postDelayed
      val encoded=JSONObject.quote(uri.toString())
      val token=JSONObject.quote(delivery)
      val handler=if(uri.host=="study")"remoOpenWidgetStudy" else "remoOpenWidgetLink"
      // A capture/focus action must finish its normal durable save before the
      // intent is consumed. Poll an acknowledgement rather than treating a JS
      // Promise as success or replaying it while that save is still running.
      val script="""(()=>{const key=$token;if(window.remoWidgetLinkDone===key)return true;
        const handler=window.$handler;if(!handler)return false;
        if(window.remoWidgetLinkPending!==key){window.remoWidgetLinkPending=key;
          Promise.resolve(handler($encoded,key)).then(ok=>{if(ok)window.remoWidgetLinkDone=key;else if(window.remoWidgetLinkPending===key)window.remoWidgetLinkPending=null;}).catch(()=>{if(window.remoWidgetLinkPending===key)window.remoWidgetLinkPending=null;});}
        return false;})()"""
      web.evaluateJavascript(script) { result ->
        if(delivery==widgetDeliveryId&&intent?.data==uri){
          if(result=="true")intent.data=null else deliverStudyLink(attempt+1)
        }
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
