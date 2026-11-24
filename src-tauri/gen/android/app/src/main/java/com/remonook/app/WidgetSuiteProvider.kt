package com.remonook.app

import android.app.KeyguardManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

abstract class WidgetSuiteProvider : AppWidgetProvider() {
    abstract val kind:String
    override fun onUpdate(context:Context,manager:AppWidgetManager,ids:IntArray){ids.forEach {WidgetSuiteRendering.render(context,it,kind)}}
    override fun onAppWidgetOptionsChanged(context:Context,manager:AppWidgetManager,id:Int,options:Bundle){WidgetSuiteRendering.render(context,id,kind)}
    override fun onDeleted(context:Context,ids:IntArray){ids.forEach {StudyWidgetStore.preferences(context,it).edit().clear().commit()}}
    override fun onReceive(context:Context,intent:Intent){
        super.onReceive(context,intent)
        if(intent.action!=WidgetSuiteRendering.COMPLETE)return
        val id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1)
        if(id<0)return
        synchronized(StudyWidgetStore.lock){
            val prefs=StudyWidgetStore.preferences(context,id)
            try{
                if(prefs.getString("suite-token",null)!=intent.getStringExtra("token"))return
                if(context.getSystemService(KeyguardManager::class.java).isDeviceLocked||(prefs.getBoolean("privacy",false)&&kind !in listOf("rhythm","capture")))return
                val snapshot=StudyWidgetStore.snapshot(context)
                if(snapshot.scope==null||snapshot.scope!=prefs.getString("scope",null))return
                val operation=intent.getStringExtra("operation")
                if(kind=="focus"&&operation in listOf("start","pause","end")){
                    WidgetSuiteActions.focus(context,snapshot,operation!!)
                }else if(kind=="resurface"&&operation=="next"){
                    val cards=snapshot.resurfaceCards.ifEmpty{listOfNotNull(snapshot.resurface)}
                    val current=cards.indexOfFirst{it.id==prefs.getString("resurface-id",null)}.coerceAtLeast(0)
                    if(cards.isNotEmpty())prefs.edit().putString("resurface-id",cards[(current+1)%cards.size].id).commit()
                }else if(kind=="rhythm"&&operation=="range"){
                    prefs.edit().putInt("rhythm-days",if(prefs.getInt("rhythm-days",28)==28)7 else 28).commit()
                }else if(kind=="today"){
                val item=snapshot.today.find {it.id==intent.getStringExtra("target")&&it.fingerprint==intent.getStringExtra("fingerprint")} ?: return
                if(item.date!=WidgetSuiteRendering.date(System.currentTimeMillis()))return
                WidgetSuiteActions.complete(context,snapshot,item,intent.getStringExtra("token")!!)
                }
                prefs.edit().remove("suite-error").commit()
            }catch(error:Exception){
                android.util.Log.e("RemoWidget","Cannot save widget check-off",error)
                prefs.edit().putString("suite-error","Could not save this check-off. Open RemoNook to check. Existing actions are kept.").commit()
            }
            WidgetSuiteRendering.refreshAll(context)
        }
    }
}
class TodayWidgetProvider:WidgetSuiteProvider(){override val kind="today"}
class CaptureWidgetProvider:WidgetSuiteProvider(){override val kind="capture"}
class FocusWidgetProvider:WidgetSuiteProvider(){override val kind="focus"}
class RhythmWidgetProvider:WidgetSuiteProvider(){override val kind="rhythm"}
class ResurfaceWidgetProvider:WidgetSuiteProvider(){override val kind="resurface"}

internal object WidgetSuiteRendering {
    const val COMPLETE="com.remonook.app.WIDGET_COMPLETE"
    val providers=listOf(TodayWidgetProvider::class.java to "today",CaptureWidgetProvider::class.java to "capture",FocusWidgetProvider::class.java to "focus",RhythmWidgetProvider::class.java to "rhythm",ResurfaceWidgetProvider::class.java to "resurface")
    val names=mapOf("today" to "Today","capture" to "Quick capture","focus" to "Focus","rhythm" to "Study rhythm","resurface" to "Resurface")
    fun date(at:Long)=SimpleDateFormat("yyyy-MM-dd",Locale.US).format(Date(at))
    fun refreshAll(context:Context){
        try {val manager=AppWidgetManager.getInstance(context)
            for((provider,kind)in providers)manager.getAppWidgetIds(ComponentName(context,provider)).forEach {render(context,it,kind)}
        }catch(error:Exception){android.util.Log.e("RemoWidget","Cannot refresh launcher widgets",error)}
    }
    fun kind(context:Context,id:Int):String?{
        val provider=AppWidgetManager.getInstance(context).getAppWidgetInfo(id)?.provider?.className
        return providers.find {it.first.name==provider}?.second
    }
    private fun link(context:Context,id:Int,host:String,params:Map<String,String> = emptyMap()):PendingIntent {
        val uri=Uri.Builder().scheme("remonook").authority(host)
        StudyWidgetStore.preferences(context,id).getString("scope",null)?.let {uri.appendQueryParameter("scope",it)}
        params.forEach {(key,value)->uri.appendQueryParameter(key,value)}
        return PendingIntent.getActivity(context,id,Intent(context,MainActivity::class.java).setData(uri.build()),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    private fun operation(context:Context,id:Int,kind:String,token:String,operation:String,target:StudyWidgetStore.TodayItem?=null):PendingIntent {
        val provider=providers.first{it.second==kind}.first
        val intent=Intent(context,provider).setAction(COMPLETE).setData(Uri.parse("remonook-widget://action/$id/$token/$operation"))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).putExtra("token",token).putExtra("operation",operation)
        target?.let{intent.putExtra("target",it.id).putExtra("fingerprint",it.fingerprint)}
        return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    private fun capture(context:Context,id:Int,scope:String,mode:String)=PendingIntent.getActivity(context,id,
        Intent(context,WidgetSuiteCaptureActivity::class.java).setData(Uri.parse("remonook-widget://capture/$id/$mode")).putExtra("scope",scope).putExtra("mode",mode),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun configure(context:Context,id:Int)=PendingIntent.getActivity(context,id,
        Intent(context,WidgetSuiteConfigureActivity::class.java).setData(Uri.parse("remonook-widget://configure/$id")).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun render(context:Context,id:Int,kind:String){
        try {synchronized(StudyWidgetStore.lock){
            val token=StudyWidgetStore.id()
            require(StudyWidgetStore.preferences(context,id).edit().putString("suite-token",token).commit())
            val opts=AppWidgetManager.getInstance(context).getAppWidgetOptions(id)
            val remote=WidgetSuiteSizes.views(context,opts){w,h->paint(context,id,kind,token,w,h)}
            AppWidgetManager.getInstance(context).updateAppWidget(id,remote)
        }}catch(error:Exception){
            android.util.Log.e("RemoWidget","Cannot paint $kind widget $id",error)
            try {
                val fallback=RemoteViews(context.packageName,R.layout.study_widget_message)
                fallback.setTextViewText(R.id.widget_title,names[kind]?:"RemoNook")
                fallback.setTextViewText(R.id.widget_body,"Open RemoNook to refresh this widget.")
                fallback.setTextColor(R.id.widget_body,context.getColor(R.color.widget_marigold_onsurface))
                fallback.setInt(R.id.widget_root,"setBackgroundResource",R.drawable.widget_marigold_surface_28)
                fallback.setViewVisibility(R.id.widget_deck,View.GONE)
                fallback.setOnClickPendingIntent(R.id.widget_root,link(context,id,"today"))
                AppWidgetManager.getInstance(context).updateAppWidget(id,fallback)
            }catch(error:Exception){android.util.Log.e("RemoWidget","Cannot show recovery message",error)}
        }
    }
    /** Shorten presentation at word boundaries; the full note remains in the app. */
    internal fun fit(context:Context,text:String,width:Int,lines:Int,size:Float=14f):String {
        val paint=android.text.TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        paint.textSize=size*context.resources.displayMetrics.scaledDensity
        val pixels=maxOf(1,(width*context.resources.displayMetrics.density).toInt())
        fun fits(value:String)=android.text.StaticLayout.Builder.obtain(value,0,value.length,paint,pixels).setIncludePad(true).build().lineCount<=lines
        if(fits(text))return text
        val words=text.trim().split(Regex("\\s+"));var result=""
        for(word in words){val next=if(result.isEmpty())word else "$result $word";if(!fits("$next…"))break;result=next}
        return if(result.isEmpty())"Open" else "$result…"
    }
    internal fun paint(context:Context,id:Int,kind:String,token:String,width:Int,height:Int):RemoteViews {
        val prefs=StudyWidgetStore.preferences(context,id)
        val snapshot=try{StudyWidgetStore.snapshot(context)}catch(_:Exception){null}
        val paint=WidgetPaint.effective(context,snapshot,prefs.getString("palette","app"))
        val scale=context.resources.configuration.fontScale
        fun message(copy:String,setup:Boolean=false):RemoteViews {
            val v=RemoteViews(context.packageName,R.layout.study_widget_message)
            paint.background(v,R.id.widget_root,"surface","28");paint.text(v,R.id.widget_title,"eyebrow");paint.text(v,R.id.widget_body,"onSurface")
            v.setTextViewText(R.id.widget_title,names[kind]?:"RemoNook")
            val size=if(width<160||height<120*scale)12f else 14f
            v.setTextViewTextSize(R.id.widget_body,android.util.TypedValue.COMPLEX_UNIT_SP,size)
            v.setTextViewText(R.id.widget_body,fit(context,copy,width-32,maxOf(1,((height-60)/(20*scale)).toInt()),size))
            v.setContentDescription(R.id.widget_body,copy)
            v.setViewVisibility(R.id.widget_deck,View.GONE);v.setViewVisibility(R.id.widget_status,View.GONE)
            v.setViewVisibility(R.id.widget_private_1,View.GONE);v.setViewVisibility(R.id.widget_private_2,View.GONE)
            v.setViewVisibility(R.id.widget_title,if(height<120*scale)View.GONE else View.VISIBLE)
            val host=when(kind){"focus"->"focus";"rhythm"->"study";"resurface"->"note";"capture"->"capture";else->"today"}
            val params=when(kind){"resurface"->mapOf("id" to (snapshot?.resurface?.id?:""));"capture"->mapOf("mode" to "text");else->emptyMap()}
            v.setOnClickPendingIntent(R.id.widget_root,if(setup)configure(context,id) else link(context,id,host,params))
            return v
        }
        if(snapshot==null)return message("Open RemoNook to refresh the widget cache.")
        if(snapshot.scope==null)return message("Enable widgets in RemoNook → Settings → Study, then configure this widget.",true)
        if(snapshot.scope!=prefs.getString("scope",null))return message("Choose this workspace in widget settings.",true)
        if(context.getSystemService(KeyguardManager::class.java).isDeviceLocked)return message("Unlock and open RemoNook to see your notes.")
        if(prefs.getBoolean("privacy",false)&&kind !in listOf("capture","rhythm"))return message("Private widget · open RemoNook to view.")
        // Compact widgets retain their primary action instead of an inert resize card.
        val compactHeight=when(kind){"rhythm"->80*scale;"capture"->if(width>=280)72f else 160*scale;"resurface"->220*scale;"focus"->180*scale;else->160*scale}
        if(width<240||height<compactHeight)return compact(context,id,kind,token,width,height,snapshot,paint)
        val layout=when(kind){"today"->R.layout.widget_suite_today;"capture"->if(width>=260&&height<170)R.layout.widget_suite_capture_wide else R.layout.widget_suite_capture;"focus"->R.layout.widget_suite_focus;"rhythm"->R.layout.widget_suite_rhythm;else->R.layout.widget_suite_resurface}
        val v=RemoteViews(context.packageName,layout)
        paint.background(v,R.id.suite_root,if(kind=="capture")"hero" else "surface","28")
        val inset=(8*context.resources.displayMetrics.density).toInt();v.setViewPadding(R.id.suite_root,inset,inset,inset,inset)
        if(!(kind=="capture"&&layout==R.layout.widget_suite_capture_wide))paint.text(v,R.id.suite_title,if(kind=="capture")"heroAccent" else "eyebrow")
        fun text(view:Int,value:String,role:String="onSurface"){v.setTextViewText(view,value);paint.text(v,view,role)}
        fun control(view:Int,label:String,pending:PendingIntent,primary:Boolean=false){
            text(view,label,if(primary)"onPrimary" else "onSurface")
            paint.background(v,view,if(primary)"primary" else "surfaceAlt","pill")
            v.setContentDescription(view,label);v.setOnClickPendingIntent(view,pending)
        }
        when(kind){
            "today"->{
                if(date(snapshot.updatedAt)!=date(System.currentTimeMillis())||snapshot.today.any {it.date!=date(System.currentTimeMillis())})return message("Open RemoNook to refresh today’s list.")
                prefs.getString("suite-error",null)?.let{return message(it)}
                val count=maxOf(1,((height-100*scale)/(maxOf(48f,52*scale))).toInt()).coerceAtMost(8)
                val items=snapshot.today.take(count)
                val queued=snapshot.today.count {WidgetSuiteActions.queued(context,snapshot.scope,it)}
                text(R.id.suite_title,"TODAY")
                text(R.id.suite_caption,"${snapshot.today.count {it.done}} of ${snapshot.today.size} done","muted")
                text(R.id.suite_status,if(queued>0)"$queued saved on device · pending app" else "","muted")
                v.setViewVisibility(R.id.suite_status,if(queued>0)View.VISIBLE else View.GONE)
                val rowIds=listOf(R.id.suite_row_0,R.id.suite_row_1,R.id.suite_row_2,R.id.suite_row_3,R.id.suite_row_4,R.id.suite_row_5,R.id.suite_row_6,R.id.suite_row_7)
                val checkIds=listOf(R.id.suite_check_0,R.id.suite_check_1,R.id.suite_check_2,R.id.suite_check_3,R.id.suite_check_4,R.id.suite_check_5,R.id.suite_check_6,R.id.suite_check_7)
                val itemIds=listOf(R.id.suite_item_0,R.id.suite_item_1,R.id.suite_item_2,R.id.suite_item_3,R.id.suite_item_4,R.id.suite_item_5,R.id.suite_item_6,R.id.suite_item_7)
                val timeIds=listOf(R.id.suite_time_0,R.id.suite_time_1,R.id.suite_time_2,R.id.suite_time_3,R.id.suite_time_4,R.id.suite_time_5,R.id.suite_time_6,R.id.suite_time_7)
                for(i in 0..7){
                    val item=items.getOrNull(i);v.setViewVisibility(rowIds[i],if(item==null)View.GONE else View.VISIBLE)
                    if(item==null)continue
                    val pending=WidgetSuiteActions.queued(context,snapshot.scope,item);val done=item.done||pending
                    text(checkIds[i],if(done)"✓" else "○",if(done)"onPrimary" else "onSurface")
                    paint.background(v,checkIds[i],if(done)"primary" else "surfaceAlt","pill")
                    v.setBoolean(checkIds[i],"setEnabled",!done)
                    v.setContentDescription(checkIds[i],if(pending)"${item.text}, saved on device, pending app" else if(item.done)"${item.text}, done" else "Complete ${item.text}")
                    val event=Intent(context,TodayWidgetProvider::class.java).setAction(COMPLETE).setData(Uri.parse("remonook-widget://complete/$id/$token/$i"))
                        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).putExtra("token",token).putExtra("target",item.id).putExtra("fingerprint",item.fingerprint)
                    v.setOnClickPendingIntent(checkIds[i],PendingIntent.getBroadcast(context,0,event,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                    val separateTime=item.time.isNotEmpty()&&scale<=1.3f
                    val label=if(item.time.isNotEmpty()&&!separateTime)item.time+" · "+item.text else item.text
                    text(itemIds[i],fit(context,label,width-(if(separateTime)144 else 88),2),if(done)"muted" else "onSurface")
                    v.setContentDescription(itemIds[i],if(item.time.isEmpty())item.text else item.time+" · "+item.text)
                    text(timeIds[i],item.time,"muted");v.setViewVisibility(timeIds[i],if(separateTime)View.VISIBLE else View.GONE)
                    v.setOnClickPendingIntent(itemIds[i],if(item.id.startsWith("bullet:"))link(context,id,"note",mapOf("id" to item.id.removePrefix("bullet:"))) else link(context,id,"today"))
                }
                text(R.id.suite_empty,if(items.isEmpty())"A little room in your day." else "")
                v.setViewVisibility(R.id.suite_empty,if(items.isEmpty())View.VISIBLE else View.GONE)
                control(R.id.suite_open,if(snapshot.today.size>items.size)"View all ${snapshot.today.size}" else "Open Today",link(context,id,"today"))
            }
            "capture"->{
                for((view,mode,label)in listOf(Triple(R.id.suite_voice,"voice","Speak"),Triple(R.id.suite_type,"text","Type"),Triple(R.id.suite_photo,"photo","Photo"))){
                    paint.background(v,view,if(mode=="voice")"accent" else "surfaceAlt","pill")
                    text(view,label,if(mode=="voice")"onAccent" else "onSurface")
                    v.setContentDescription(view,when(mode){"voice"->"Dictate a note into Inbox";"photo"->"Photo to notes in Inbox";else->"Type a note into Inbox"})
                    v.setOnClickPendingIntent(view,capture(context,id,snapshot.scope,mode))
                }
            }
            "focus"->{
                val f=WidgetSuiteActions.effectiveFocus(context,snapshot) ?: return message("Add a Focus timer in Dashboard, then open RemoNook to refresh.")
                val running=f.running&&f.endsAt>System.currentTimeMillis()
                text(R.id.suite_title,if(f.mode=="focus")"FOCUS" else "TAKE A BREATH")
                text(R.id.suite_caption,fit(context,f.label,width-32,2,12f),"muted")
                val seconds=if(f.running)maxOf(0,(f.endsAt-System.currentTimeMillis())/1000).toInt() else f.remaining
                text(R.id.suite_timer,String.format(Locale.US,"%02d:%02d",seconds/60,seconds%60))
                paint.text(v,R.id.suite_clock,"onSurface")
                v.setViewVisibility(R.id.suite_clock,if(running)View.VISIBLE else View.GONE)
                v.setViewVisibility(R.id.suite_timer,if(running)View.GONE else View.VISIBLE)
                val size=if(width<200)32f else 44f
                v.setTextViewTextSize(R.id.suite_timer,android.util.TypedValue.COMPLEX_UNIT_SP,size)
                v.setTextViewTextSize(R.id.suite_clock,android.util.TypedValue.COMPLEX_UNIT_SP,size)
                v.setChronometer(R.id.suite_clock,SystemClock.elapsedRealtime()+maxOf(0,f.endsAt-System.currentTimeMillis()),null,running)
                v.setBoolean(R.id.suite_clock,"setCountDown",true)
                val params=mapOf("id" to f.id,"cycle" to f.cycle)
                control(R.id.suite_primary,if(running)"Pause" else "Start",operation(context,id,kind,token,if(running)"pause" else "start"),true)
                control(R.id.suite_end,"End",operation(context,id,kind,token,"end"))
                text(R.id.suite_status,if(StudyWidgetStore.pending(context,snapshot.scope)>0)"Saved on device · pending app" else "","muted")
            }
            "rhythm"->{
                val rhythm=snapshot.rhythm ?: return message("Study some cards in RemoNook to build your rhythm.")
                val range=prefs.getInt("rhythm-days",28);val counts=rhythm.days.takeLast(range)
                val active=counts.count {it>0}
                text(R.id.suite_title,"$active / $range DAYS")
                text(R.id.suite_caption,"${counts.sum()} cards · tap for ${if(range==28)7 else 28} days","muted")
                val ids=listOf(R.id.suite_day_0,R.id.suite_day_1,R.id.suite_day_2,R.id.suite_day_3,R.id.suite_day_4,R.id.suite_day_5,R.id.suite_day_6,R.id.suite_day_7,R.id.suite_day_8,R.id.suite_day_9,R.id.suite_day_10,R.id.suite_day_11,R.id.suite_day_12,R.id.suite_day_13,R.id.suite_day_14,R.id.suite_day_15,R.id.suite_day_16,R.id.suite_day_17,R.id.suite_day_18,R.id.suite_day_19,R.id.suite_day_20,R.id.suite_day_21,R.id.suite_day_22,R.id.suite_day_23,R.id.suite_day_24,R.id.suite_day_25,R.id.suite_day_26,R.id.suite_day_27)
                ids.forEachIndexed {i,view->v.setViewVisibility(view,if(i<28-range)View.GONE else View.VISIBLE);paint.background(v,view,if(rhythm.days[i]==0)"surfaceAlt" else if(rhythm.days[i]<10)"accent" else "primary","16")}
                v.setContentDescription(R.id.suite_root,"Studied on $active of the last 28 days. ${rhythm.total} cards reviewed.")
                v.setOnClickPendingIntent(R.id.suite_root,operation(context,id,kind,token,"range"))
            }
            "resurface"->{
                val cards=snapshot.resurfaceCards.ifEmpty{listOfNotNull(snapshot.resurface)}
                val note=(cards.find{it.id==prefs.getString("resurface-id",null)}?:cards.firstOrNull()) ?: return message("Enable meaning search in RemoNook to revisit your notes.")
                text(R.id.suite_title,"A THOUGHT TO REVISIT")
                text(R.id.suite_path,fit(context,note.path,width-32,1,12f),"muted")
                text(R.id.suite_note,fit(context,note.text,width-32,if(height>=320*scale)5 else 2,16f))
                v.setContentDescription(R.id.suite_note,note.text)
                text(R.id.suite_related,fit(context,"Related · "+note.relatedText,width-48,if(height>=260*scale)2 else 1,13f))
                paint.background(v,R.id.suite_related,"surfaceAlt","16")
                v.setViewVisibility(R.id.suite_related,if(note.relatedText.isNotEmpty())View.VISIBLE else View.GONE)
                control(R.id.suite_open,if(cards.size>1)"Next thought" else "Open note",if(cards.size>1)operation(context,id,kind,token,"next") else link(context,id,"note",mapOf("id" to note.id)),true)
                v.setViewVisibility(R.id.suite_open,View.VISIBLE)
                v.setViewVisibility(R.id.suite_status,View.GONE)
                v.setOnClickPendingIntent(R.id.suite_root,link(context,id,"note",mapOf("id" to note.id)))
            }
        }
        return v
    }
    private fun compact(context:Context,id:Int,kind:String,token:String,width:Int,height:Int,snapshot:StudyWidgetStore.Snapshot,paint:WidgetPaint):RemoteViews {
        val v=RemoteViews(context.packageName,R.layout.widget_suite_action)
        val scale=context.resources.configuration.fontScale
        paint.background(v,R.id.suite_root,if(kind=="capture")"hero" else "surface","28")
        fun text(view:Int,value:String,role:String="onSurface"){v.setTextViewText(view,value);paint.text(v,view,role)}
        fun primary(label:String,pending:PendingIntent){text(R.id.suite_primary,label,"onPrimary");paint.background(v,R.id.suite_primary,"primary","pill");v.setContentDescription(R.id.suite_primary,label);v.setOnClickPendingIntent(R.id.suite_primary,pending)}
        v.setViewVisibility(R.id.suite_title,if(height>=180*scale)View.VISIBLE else View.GONE)
        text(R.id.suite_title,names[kind]?:"RemoNook",if(kind=="capture")"heroAccent" else "eyebrow")
        v.setViewVisibility(R.id.suite_clock,View.GONE);v.setViewVisibility(R.id.suite_end,View.GONE);v.setViewVisibility(R.id.suite_note,View.VISIBLE)
        val lines=maxOf(1,((height-12-48)/(16*scale)).toInt())
        when(kind){
            "today"->{
                val next=snapshot.today.firstOrNull{!it.done&&!WidgetSuiteActions.queued(context,snapshot.scope!!,it)}
                text(R.id.suite_note,fit(context,next?.text?:"All caught up",width-12,lines,12f))
                if(next!=null)primary("Done",operation(context,id,kind,token,"complete",next))
                else primary("Today",link(context,id,"today"))
            }
            "focus"->{
                val f=WidgetSuiteActions.effectiveFocus(context,snapshot)
                if(f==null){text(R.id.suite_note,"No timer yet");primary("Set up",link(context,id,"focus"))}
                else {
                    val running=f.running&&f.endsAt>System.currentTimeMillis()
                    val seconds=if(f.running)maxOf(0,(f.endsAt-System.currentTimeMillis())/1000).toInt() else f.remaining
                    text(R.id.suite_note,String.format(Locale.US,"%02d:%02d",seconds/60,seconds%60))
                    v.setTextViewTextSize(R.id.suite_note,android.util.TypedValue.COMPLEX_UNIT_SP,if(width>=160)22f else 16f)
                    v.setViewVisibility(R.id.suite_note,if(running)View.GONE else View.VISIBLE)
                    v.setViewVisibility(R.id.suite_clock,if(running)View.VISIBLE else View.GONE)
                    paint.text(v,R.id.suite_clock,"onSurface")
                    v.setTextViewTextSize(R.id.suite_clock,android.util.TypedValue.COMPLEX_UNIT_SP,if(width>=160)22f else 16f)
                    v.setBoolean(R.id.suite_clock,"setCountDown",true);v.setChronometer(R.id.suite_clock,SystemClock.elapsedRealtime()+maxOf(0,f.endsAt-System.currentTimeMillis()),null,running)
                    primary(if(running)"Pause" else "Start",operation(context,id,kind,token,if(running)"pause" else "start"))
                    if(height>=180){v.setViewVisibility(R.id.suite_end,View.VISIBLE);text(R.id.suite_end,"End");paint.background(v,R.id.suite_end,"surfaceAlt","pill");v.setOnClickPendingIntent(R.id.suite_end,operation(context,id,kind,token,"end"));v.setContentDescription(R.id.suite_end,"End focus timer")}
                }
            }
            "capture"->{text(R.id.suite_note,fit(context,"Catch a thought",width-12,lines,12f),"onHero");primary("Capture",capture(context,id,snapshot.scope!!,"text"))}
            "rhythm"->{val range=StudyWidgetStore.preferences(context,id).getInt("rhythm-days",28);val counts=snapshot.rhythm?.days?.takeLast(range)?:emptyList();text(R.id.suite_note,"${counts.count{it>0}} / $range days");primary(if(range==28)"7 days" else "28 days",operation(context,id,kind,token,"range"))}
            else->{val cards=snapshot.resurfaceCards.ifEmpty{listOfNotNull(snapshot.resurface)};val selected=cards.find{it.id==StudyWidgetStore.preferences(context,id).getString("resurface-id",null)}?:cards.firstOrNull();text(R.id.suite_note,fit(context,selected?.text?:"Enable meaning search",width-12,lines,12f));primary(if(cards.size>1)"Next" else "Open",if(cards.size>1)operation(context,id,kind,token,"next") else link(context,id,"note",mapOf("id" to (selected?.id?:""))))}
        }
        val bodyHeight=height-12-48-(if(kind=="focus"&&height>=180)48 else 0)
        if(bodyHeight<20*scale)v.setViewVisibility(R.id.suite_mini_content,View.GONE)
        return v
    }

}
