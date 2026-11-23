package com.remonook.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import org.json.JSONObject
import android.content.Intent

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[33],qualifiers="mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WidgetScreenshotsTest {
    private fun screenshot(context:Context,name:String,view:View,width:Int,height:Int){
        view.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY))
        view.layout(0,0,width,height)
        val image=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888)
        view.draw(Canvas(image))
        val dir=File("../../docs/widgets/screenshots").apply{mkdirs()}
        File(dir,"$name.png").outputStream().use{image.compress(Bitmap.CompressFormat.PNG,100,it)}
    }
    @Test @Config(sdk=[28]) fun legacyPaletteBackgrounds(){
        val context=RuntimeEnvironment.getApplication()
        assertEquals("marigold",WidgetPaint.palette("future"))
        val legacy=StudyWidgetStore.Snapshot("test","Notes",1,1,emptyList())
        assertEquals("marigold",WidgetPaint.effective(context,legacy,"app").palette)
        for(id in WidgetPaint.ids)assertEquals(id,WidgetPaint.effective(context,legacy,id).palette)
        assertEquals("marigold",WidgetPaint.effective(context,legacy,"unknown").palette)
        for(palette in WidgetPaint.ids){
            val paint=WidgetPaint(context,palette)
            val remote=android.widget.RemoteViews(context.packageName,R.layout.study_widget_message)
            paint.background(remote,R.id.widget_root,"surface","28")
            assertNotNull(remote.apply(context,FrameLayout(context)).background)
        }
    }
    @Test fun renderNativeStates(){
        for((palette,mode)in listOf("marigold" to Configuration.UI_MODE_NIGHT_NO,"iris" to Configuration.UI_MODE_NIGHT_YES)){
            val context=RuntimeEnvironment.getApplication()
            val config=Configuration(context.resources.configuration)
            config.uiMode=Configuration.UI_MODE_TYPE_NORMAL or mode
            context.resources.updateConfiguration(config,context.resources.displayMetrics)
            val id=17
            val manager=AppWidgetManager.getInstance(context)
            val info=AppWidgetProviderInfo().apply{provider=ComponentName(context,StudyWidgetProvider::class.java)}
            shadowOf(manager).addBoundWidget(id,info)
            val prefs=StudyWidgetStore.preferences(context,id)
            val root=JSONObject("""{"schema":2,"scope":"fixture","workspaceName":"My notes","revision":1,"updatedAt":1,"appearance":{"palette":"$palette","dynamic":false},"decks":[{"id":"deck","title":"Geography","cards":[{"id":"q","fingerprint":"v1","question":"What is the capital of Mizoram?","answer":"Aizawl — on a ridge north of the Tlawng river."}]}]}""")
            val demoCards=org.json.JSONArray()
            for(index in 0 until 12){
                demoCards.put(JSONObject().put("id",if(index==0)"q" else "q$index").put("fingerprint","v1")
                    .put("question","What is the capital of Mizoram?")
                    .put("answer","Aizawl — on a ridge north of the Tlawng river.")
                    .put("intervals",JSONObject("""{"AGAIN":"1 min","HARD":"2 d","GOOD":"5 d","EASY":"12 d"}""")))
            }
            root.getJSONArray("decks").getJSONObject(0).put("cards",demoCards).put("tomorrow",9).put("doneToday",4)
            val directory=StudyWidgetStore.directory(context).apply{mkdirs()}
            fun snapshot(){File(directory,"snapshot.json").writeText(root.toString())}
            snapshot()
            for((name,w,h)in listOf(Triple("2x2",180,180),Triple("4x2",360,220),Triple("4x4-revealed",360,440),Triple("caught-up",180,240),Triple("locked",180,240),Triple("too-small",100,100))){
                prefs.edit().clear().putString("scope","fixture").putString("deckId","deck").putBoolean("privacy",false).putBoolean("visible",true).putString("cardId","q").putString("fingerprint","v1").putString("phase",if(name.contains("revealed"))"answer" else "question").commit()
                root.getJSONArray("decks").getJSONObject(0).put("cards",if(name=="caught-up")org.json.JSONArray() else demoCards)
                snapshot()
                shadowOf(context.getSystemService(android.app.KeyguardManager::class.java)).setIsDeviceLocked(name=="locked")
                manager.updateAppWidgetOptions(id,Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,w);putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,h)})
                val remote=StudyWidgetProvider.paintView(context,id,"test",w,h)
                val view=remote.apply(context,FrameLayout(context))
                screenshot(context,"$palette-$name",view,w,h)
                if(name=="locked")assertFalse((view.findViewById<android.widget.TextView>(R.id.widget_body)).text.contains("Aizawl"))
            }
            config.fontScale=2f
            context.resources.updateConfiguration(config,context.resources.displayMetrics)
            snapshot()
            prefs.edit().putString("phase","answer").commit()
            val enlarged=StudyWidgetProvider.paintView(context,id,"test",420,600).apply(context,FrameLayout(context))
            screenshot(context,"$palette-200-percent",enlarged,420,600)
            config.fontScale=1f
            context.resources.updateConfiguration(config,context.resources.displayMetrics)
            shadowOf(context.getSystemService(android.app.KeyguardManager::class.java)).setIsDeviceLocked(false)
            val activity=Robolectric.buildActivity(StudyWidgetConfigureActivity::class.java,
                Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id)).setup().get()
            screenshot(activity,"$palette-configure",activity.window.decorView,400,800)
            assertEquals("marigold",WidgetPaint.palette("unknown"))
        }
    }
}
