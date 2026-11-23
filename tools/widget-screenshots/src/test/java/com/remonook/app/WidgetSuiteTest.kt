package com.remonook.app

import android.app.KeyguardManager
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
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

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[33],qualifiers="mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WidgetSuiteTest {
    private fun fixture(context:Context,palette:String):JSONObject {
        val date=WidgetSuiteRendering.date(System.currentTimeMillis())
        val items=JSONArray()
        listOf("Revise Newton’s laws","Mock test · Physics","Send lab report to Priya").forEachIndexed {i,text->items.put(JSONObject().put("id","bullet:note-$i").put("text",text).put("time",if(i==1)"16:00" else "").put("done",i==0).put("date",date).put("fingerprint","a".repeat(64)))}
        val days=JSONArray((0 until 28).map {if(it%7==0)0 else it%16})
        val root=JSONObject().put("schema",3).put("scope","suite-test").put("workspaceName","My notes").put("updatedAt",System.currentTimeMillis()).put("revision",1).put("decks",JSONArray())
            .put("appearance",JSONObject().put("palette",palette).put("dynamic",false)).put("today",items)
            .put("focus",JSONObject().put("id","focus").put("label","Organic chemistry · chapter 4").put("cycle","session").put("mode","focus").put("remaining",1122).put("running",true).put("endsAt",System.currentTimeMillis()+1122000))
            .put("rhythm",JSONObject().put("days",days).put("total",(0 until 28).sumOf {days.getInt(it)}))
            .put("resurface",JSONObject().put("id","older").put("text","The best way to learn is to connect a new idea to something you already know.").put("path","Learning / Connections").put("relatedText","Practice recall before returning to the page."))
        File(StudyWidgetStore.directory(context).apply{mkdirs()},"snapshot.json").writeText(root.toString())
        return root
    }
    private fun screenshot(context:Context,name:String,view:View,width:Int,height:Int){
        view.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY));view.layout(0,0,width,height)
        val bitmap=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);view.draw(Canvas(bitmap))
        val directory=File("../../docs/widgets/screenshots").apply {mkdirs()}
        File(directory,"$name.png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}
    }
    @Test fun allWidgetsPalettesStatesAndSnapshots(){
        val context=RuntimeEnvironment.getApplication()
        val manager=AppWidgetManager.getInstance(context)
        for(palette in WidgetPaint.ids)for(dark in listOf(false,true)){
            val configuration=Configuration(context.resources.configuration).apply {uiMode=Configuration.UI_MODE_TYPE_NORMAL or if(dark)Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO;fontScale=1f}
            context.resources.updateConfiguration(configuration,context.resources.displayMetrics)
            fixture(context,palette)
            assertEquals(28,StudyWidgetStore.snapshot(context).rhythm!!.days.size)
            for((index,pair)in WidgetSuiteRendering.providers.withIndex()){
                val (provider,kind)=pair;val id=500+index
                shadowOf(manager).addBoundWidget(id,AppWidgetProviderInfo().apply{this.provider=ComponentName(context,provider)})
                val prefs=StudyWidgetStore.preferences(context,id);prefs.edit().clear().putString("scope","suite-test").commit()
                val width=if(kind in listOf("focus","capture"))180 else 360
                val height=when(kind){"today"->360;"rhythm"->130;else->220}
                val remote=WidgetSuiteRendering.paint(context,id,kind,"fixture",width,height)
                val view=remote.apply(context,FrameLayout(context));assertNotNull(view)
                if((palette=="marigold"&&!dark)||(palette=="iris"&&dark))screenshot(context,"suite-$palette-$kind",view,width,height)
                WidgetSuiteRendering.render(context,id,kind)
                assertNotNull(shadowOf(manager).getViewFor(id))
                shadowOf(context.getSystemService(KeyguardManager::class.java)).setIsDeviceLocked(true)
                val locked=WidgetSuiteRendering.paint(context,id,kind,"fixture",width,height).apply(context,FrameLayout(context))
                assertTrue(locked.findViewById<TextView>(R.id.widget_body).text.contains("Unlock"))
                assertFalse(locked.toString().contains("Organic chemistry"))
                shadowOf(context.getSystemService(KeyguardManager::class.java)).setIsDeviceLocked(false)
                prefs.edit().putString("scope","another-workspace").commit()
                val mismatch=WidgetSuiteRendering.paint(context,id,kind,"fixture",width,height).apply(context,FrameLayout(context))
                assertNotNull(mismatch.findViewById<View>(R.id.widget_body))
                prefs.edit().putString("scope","suite-test").commit()
            }
            if((palette=="marigold"&&!dark)||(palette=="iris"&&dark)){
                val activity=Robolectric.buildActivity(WidgetSuiteConfigureActivity::class.java,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,500)).setup().get()
                screenshot(activity,"suite-$palette-configure",activity.window.decorView,400,800)
                configuration.fontScale=2f;context.resources.updateConfiguration(configuration,context.resources.displayMetrics)
                val large=WidgetSuiteRendering.paint(context,500,"today","fixture",420,600).apply(context,FrameLayout(context))
                screenshot(context,"suite-$palette-large-text",large,420,600)
            }
        }
        // Native schema compatibility and complete cache bounds.
        for(schema in 1..2){val root=fixture(context,"marigold");root.put("schema",schema);listOf("today","focus","rhythm","resurface").forEach {root.remove(it)};File(StudyWidgetStore.directory(context),"snapshot.json").writeText(root.toString());assertTrue(StudyWidgetStore.snapshot(context).today.isEmpty())}
        val root=fixture(context,"marigold");root.getJSONArray("today").put(JSONObject(root.getJSONArray("today").getJSONObject(0).toString()).put("text","x".repeat(201)))
        File(StudyWidgetStore.directory(context),"snapshot.json").writeText(root.toString())
        try{StudyWidgetStore.snapshot(context);fail("oversized note accepted")}catch(_:IllegalArgumentException){}
    }
    @Test @Config(sdk=[28]) fun legacyLayoutsAndPendingCompletion(){
        val context=RuntimeEnvironment.getApplication();fixture(context,"marigold")
        val snapshot=StudyWidgetStore.snapshot(context);val item=snapshot.today[1]
        val event="43199b80-d638-44d0-9790-c93ff9290607"
        // JVM shadows cannot open directories for fsync. Real publication is
        // covered by WidgetDurabilityTest on Android API 28 and 33 emulators.
        val file=File(StudyWidgetStore.directory(context),"inbox/$event.json").apply {parentFile.mkdirs()}
        val saved=JSONObject().put("schema",1).put("type","complete").put("id",event).put("scope",snapshot.scope).put("targetId",item.id).put("fingerprint",item.fingerprint).put("date",item.date).toString()
        file.writeText(saved)
        assertTrue(WidgetSuiteActions.queued(context,snapshot.scope!!,item))
        assertFalse(WidgetSuiteActions.queued(context,"wrong-workspace",item))
        for((index,pair)in WidgetSuiteRendering.providers.withIndex()){
            val id=600+index;val manager=AppWidgetManager.getInstance(context)
            shadowOf(manager).addBoundWidget(id,AppWidgetProviderInfo().apply{provider=ComponentName(context,pair.first)})
            StudyWidgetStore.preferences(context,id).edit().putString("scope","suite-test").commit()
            WidgetSuiteRendering.render(context,id,pair.second);assertNotNull(shadowOf(manager).getViewFor(id))
        }
        TodayWidgetProvider().onDeleted(context,intArrayOf(600))
        assertEquals(saved,file.readText())
    }
}
