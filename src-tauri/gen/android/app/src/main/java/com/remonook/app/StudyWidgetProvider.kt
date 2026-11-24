package com.remonook.app

import android.app.KeyguardManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import java.text.DateFormat
import java.util.Date

/** A native launcher widget. Reveal/pagination/review never launches MainActivity. */
class StudyWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { ids.forEach { render(context, it) } }
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) { StudyWidgetStore.preferences(context,id).edit().putInt("part",0).putBoolean("grading",false).commit();render(context,id) }
    override fun onDeleted(context: Context, ids: IntArray) {
        ids.forEach { StudyWidgetStore.preferences(context,it).edit().clear().commit() }
        // Review evidence is independent of the launcher instance and is never deleted here.
    }
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context,intent)
        if(intent.action in listOf(Intent.ACTION_CONFIGURATION_CHANGED,Intent.ACTION_DATE_CHANGED,Intent.ACTION_TIMEZONE_CHANGED,Intent.ACTION_TIME_CHANGED)) {
            if(intent.action==Intent.ACTION_CONFIGURATION_CHANGED)AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context,StudyWidgetProvider::class.java)).forEach { StudyWidgetStore.preferences(context,it).edit().putInt("part",0).putBoolean("grading",false).commit() }
            refreshAll(context);return }
        if(intent.action != ACTION) return
        val id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID)
        if(id==AppWidgetManager.INVALID_APPWIDGET_ID) return
        synchronized(StudyWidgetStore.lock) {
            val prefs=StudyWidgetStore.preferences(context,id)
            try {
                if(intent.getStringExtra("token") != prefs.getString("token",null)) { render(context,id);return }
                val snapshot=StudyWidgetStore.snapshot(context)
                if(snapshot.scope==null||snapshot.scope!=prefs.getString("scope",null)) { render(context,id);return }
                val deck=snapshot.decks.find { it.id==prefs.getString("deckId",null) } ?: run {render(context,id);return}
                val cards=StudyWidgetStore.available(deck,snapshot.scope,StudyWidgetStore.receipts(context))
                val card=cards.find { it.id==prefs.getString("cardId",null)&&it.fingerprint==prefs.getString("fingerprint",null) } ?: run {render(context,id);return}
                if(context.getSystemService(KeyguardManager::class.java).isDeviceLocked) { render(context,id);return }
                val phase=prefs.getString("phase","question") ?: "question"
                val dimensions=WidgetSuiteSizes.active(context,AppWidgetManager.getInstance(context).getAppWidgetOptions(id))
                val pages=WidgetSuiteStudy.pages(context,if(phase=="answer")card.answer else card.question,dimensions.first,dimensions.second,phase)
                val part=prefs.getInt("part",0).coerceIn(0,pages.lastIndex)
                when(val action=intent.getStringExtra("operation")) {
                    "RATE" -> prefs.edit().putBoolean("grading",true).commit()
                    "OTHER_GRADE" -> prefs.edit().putInt("gradeIndex",(prefs.getInt("gradeIndex",2)+1)%4).commit()
                    "UNHIDE" -> prefs.edit().putBoolean("visible",true).commit()
                    "REVEAL" -> if(part==pages.lastIndex) prefs.edit().putString("phase",if(phase=="answer")"question" else "answer").putInt("part",0).putBoolean("grading",false).commit()
                    "QUESTION" -> prefs.edit().putString("phase","question").putInt("part",0).putBoolean("grading",false).commit()
                    "PREVIOUS" -> prefs.edit().putInt("part",maxOf(0,part-1)).commit()
                    "PART" -> prefs.edit().putInt("part",minOf(pages.lastIndex,part+1)).commit()
                    "NEXT" -> {
                        val next=cards[(cards.indexOf(card)+1)%cards.size]
                        prefs.edit().putString("cardId",next.id).putString("fingerprint",next.fingerprint).putString("phase","question").putInt("part",0).putBoolean("grading",false).putBoolean("visible",!prefs.getBoolean("privacy",true)).commit()
                    }
                    "AGAIN","HARD","GOOD","EASY" -> {
                        if(phase!="answer"||part!=pages.lastIndex) { render(context,id);return }
                        StudyWidgetStore.saveReview(context,snapshot,deck,card,action,prefs.getString("token",null)!!,id)
                        prefs.edit().remove("cardId").remove("fingerprint").putString("phase","question").putInt("part",0).putBoolean("grading",false).putBoolean("visible",!prefs.getBoolean("privacy",true)).commit()
                    }
                }
                prefs.edit().remove("error").commit()
            } catch(_:Exception) {
                prefs.edit().putString("error","Could not save or refresh. Your pending reviews are kept; open RemoNook to check.").commit()
            }
            refreshAll(context)
        }
    }
    companion object {
        private const val ACTION="com.remonook.app.STUDY_WIDGET_ACTION"
        fun refreshAll(context: Context) {
            try {
                val manager=AppWidgetManager.getInstance(context)
                manager.getAppWidgetIds(ComponentName(context,StudyWidgetProvider::class.java)).forEach { render(context,it) }
                WidgetSuiteRendering.refreshAll(context)
            } catch(error:RuntimeException) {
                android.util.Log.e("RemoStudyWidget","Cannot enumerate launcher widgets",error)
            }
        }
        private fun budget(context:Context,id:Int):Int {
            val opts=AppWidgetManager.getInstance(context).getAppWidgetOptions(id)
            return StudyWidgetPages.contentBudget(opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,300),opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,300),context.resources.configuration.fontScale)
        }
        private fun action(context:Context,id:Int,token:String,operation:String):PendingIntent {
            val intent=Intent(context,StudyWidgetProvider::class.java).setAction(ACTION)
                .setData(Uri.parse("remonook-study://widget/$id/$token/$operation"))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).putExtra("token",token).putExtra("operation",operation)
            return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        private fun configure(context:Context,id:Int):PendingIntent = PendingIntent.getActivity(context,id,
            Intent(context,StudyWidgetConfigureActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id)
                .setData(Uri.parse("remonook-study://configure/$id")),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        private fun open(context:Context,id:Int,deck:String?,card:String?=null,voice:Boolean=false):PendingIntent {
            val uri=Uri.Builder().scheme("remonook").authority("study").appendQueryParameter("deck",deck ?: "")
            uri.appendQueryParameter("scope",StudyWidgetStore.preferences(context,id).getString("scope",""))
            if(card!=null)uri.appendQueryParameter("card",card)
            if(voice)uri.appendQueryParameter("voice","1")
            return PendingIntent.getActivity(context,id,Intent(context,MainActivity::class.java).setData(uri.build()),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        private fun textLayout(context:Context,text:String,width:Int,size:Float,bold:Boolean):android.text.StaticLayout {
            val paint=android.text.TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG)
            paint.textSize=android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP,size,context.resources.displayMetrics)
            paint.typeface=if(bold)android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
            val pixels=maxOf(1,(width*context.resources.displayMetrics.density).toInt())
            return android.text.StaticLayout.Builder.obtain(text,0,text.length,paint,pixels).setIncludePad(true).build()
        }
        internal fun layout(width:Int,height:Int):Int = when {
            width<110||height<110 -> R.layout.study_widget_message
            width<260 -> R.layout.study_widget_glance
            height>=320 -> R.layout.study_widget_full
            else -> R.layout.study_widget_prompt
        }
        // A launcher can retain an allocated ID after configuration is cancelled.
        // Widget rendering is optional: never let it crash MainActivity.onResume or
        // the snapshot observer, and never change review evidence on failure.
        private fun render(context:Context,id:Int) {
            try {
                renderViews(context,id)
            } catch(error:Exception) {
                android.util.Log.e("RemoStudyWidget","Cannot render study widget $id",error)
                try {
                    // Static resource references also keep this recovery path safe
                    // if a future release accidentally strips dynamic resources.
                    val fallback=RemoteViews(context.packageName,R.layout.study_widget_message)
                    fallback.setTextViewText(R.id.widget_title,"RemoNook")
                    fallback.setTextViewText(R.id.widget_body,"Open RemoNook to refresh this widget.")
                    fallback.setTextColor(R.id.widget_title,context.getColor(R.color.widget_marigold_onsurface))
                    fallback.setTextColor(R.id.widget_body,context.getColor(R.color.widget_marigold_onsurface))
                    fallback.setInt(R.id.widget_root,"setBackgroundResource",R.drawable.widget_marigold_surface_28)
                    fallback.setViewVisibility(R.id.widget_deck,View.GONE)
                    fallback.setViewVisibility(R.id.widget_status,View.GONE)
                    fallback.setViewVisibility(R.id.widget_private_1,View.GONE)
                    fallback.setViewVisibility(R.id.widget_private_2,View.GONE)
                    fallback.setOnClickPendingIntent(R.id.widget_root,open(context,id,null))
                    AppWidgetManager.getInstance(context).updateAppWidget(id,fallback)
                } catch(fallbackError:Exception) {
                    android.util.Log.e("RemoStudyWidget","Cannot show widget recovery message $id",fallbackError)
                }
            }
        }
        private fun renderViews(context:Context,id:Int)=synchronized(StudyWidgetStore.lock) {
            val prefs=StudyWidgetStore.preferences(context,id)
            val token=StudyWidgetStore.id()
            prefs.edit().putString("token",token).commit()
            val options=AppWidgetManager.getInstance(context).getAppWidgetOptions(id)
            fun view(width:Int,height:Int):RemoteViews = paintView(context,id,token,width,height)
            val views=WidgetSuiteSizes.views(context,options,::view)
            AppWidgetManager.getInstance(context).updateAppWidget(id,views)
        }
        internal fun paintView(context:Context,id:Int,token:String,width:Int,height:Int):RemoteViews {
            val prefs=StudyWidgetStore.preferences(context,id)
            val snapshot=try {StudyWidgetStore.snapshot(context)}catch(_:Exception){null}
            val override=prefs.getString("palette","app")
            val paint=WidgetPaint.effective(context,snapshot,override)
            fun message(body:String,caught:Boolean=false,lockedState:Boolean=false,needsDeck:Boolean=false):RemoteViews {
                val v=RemoteViews(context.packageName,R.layout.study_widget_message)
                v.setViewVisibility(R.id.widget_title,View.VISIBLE)
                v.setViewVisibility(R.id.widget_deck,View.VISIBLE)
                v.setTextViewTextSize(R.id.widget_title,android.util.TypedValue.COMPLEX_UNIT_SP,12f)
                v.setTextViewTextSize(R.id.widget_body,android.util.TypedValue.COMPLEX_UNIT_SP,16f)
                v.setInt(R.id.widget_body,"setGravity",android.view.Gravity.CENTER_VERTICAL)
                v.setOnClickPendingIntent(R.id.widget_root,null)
                paint.background(v,R.id.widget_root,if(caught)"goodBg" else "surface","28")
                paint.text(v,R.id.widget_title,if(caught)"goodFg" else "eyebrow")
                paint.text(v,R.id.widget_body,if(caught)"goodFg" else "onSurface")
                paint.text(v,R.id.widget_status,if(caught)"goodFg" else "muted")
                paint.background(v,R.id.widget_deck,"primary","pill")
                paint.text(v,R.id.widget_deck,"onPrimary")
                v.setTextViewText(R.id.widget_title,if(caught)"✓  All caught up" else "RemoNook")
                for(bar in listOf(R.id.widget_private_1,R.id.widget_private_2)){
                    v.setViewVisibility(bar,if(lockedState&&height>=200*context.resources.configuration.fontScale)View.VISIBLE else View.GONE)
                    paint.background(v,bar,"outline","pill")
                }
                if(height<170||height<=120*context.resources.configuration.fontScale){
                    v.setViewVisibility(R.id.widget_title,if(height<170)View.GONE else View.VISIBLE)
                    v.setViewVisibility(R.id.widget_deck,View.GONE)
                    v.setTextViewTextSize(R.id.widget_body,android.util.TypedValue.COMPLEX_UNIT_SP,12f)
                    v.setOnClickPendingIntent(R.id.widget_root,if(needsDeck)configure(context,id) else open(context,id,prefs.getString("deckId",null)))
                }
                val small=height<170&&context.resources.configuration.fontScale>1.3f
                val copy=when {
                    small&&body.startsWith("Make") -> "Resize"
                    small -> "Open app"
                    body.length>60&&height<400*context.resources.configuration.fontScale ->
                        if(needsDeck)"Choose a deck" else if(snapshot!=null&&snapshot.scope==null)"Enable Study widgets in RemoNook" else "Open RemoNook to refresh."
                    else -> body
                }
                v.setTextViewText(R.id.widget_body,copy)
                val pendingCount=snapshot?.scope?.let {StudyWidgetStore.pending(context,it)} ?: 0
                if(caught){
                    val caption=if(body.startsWith("Next "))body else "Open RemoNook to refresh"
                    val heading="All caught up"
                    val text=android.text.SpannableString(heading+"\n"+caption)
                    text.setSpan(android.text.style.StyleSpan(android.graphics.Typeface.BOLD),0,heading.length,android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    text.setSpan(android.text.style.RelativeSizeSpan(1.125f),0,heading.length,android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    text.setSpan(android.text.style.RelativeSizeSpan(.75f),heading.length+1,text.length,android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    v.setTextViewText(R.id.widget_title,"✓")
                    v.setTextViewTextSize(R.id.widget_title,android.util.TypedValue.COMPLEX_UNIT_SP,32f)
                    if(height<=120*context.resources.configuration.fontScale)v.setViewVisibility(R.id.widget_title,View.GONE)
                    v.setTextViewText(R.id.widget_body,text)
                    v.setInt(R.id.widget_body,"setGravity",android.view.Gravity.BOTTOM)
                    v.setViewVisibility(R.id.widget_deck,View.GONE)
                    v.setOnClickPendingIntent(R.id.widget_root,open(context,id,prefs.getString("deckId",null)))
                }
                v.setTextViewText(R.id.widget_status,if(pendingCount>0)"$pendingCount saved on device · pending app" else "")
                v.setViewVisibility(R.id.widget_status,if(pendingCount>0&&height>=240*context.resources.configuration.fontScale)View.VISIBLE else View.GONE)
                v.setTextViewText(R.id.widget_deck,if(needsDeck)"Choose deck" else "Open RemoNook")
                v.setOnClickPendingIntent(R.id.widget_deck,if(needsDeck)configure(context,id) else open(context,id,prefs.getString("deckId",null)))
                return v
            }
            if(snapshot==null)return message("The study cache needs attention. Open RemoNook to refresh it. Saved review files have not been removed.")
            if(snapshot.scope==null)return message("Open RemoNook and enable Study widgets in Settings. Your reviews stay on this device until the app applies them.")
            val deck=snapshot.decks.find {it.id==prefs.getString("deckId",null)}
            if(snapshot.scope!=prefs.getString("scope",null)||deck==null)return message("Choose a deck for this widget. If your account or workspace changed, choose it again.",needsDeck=true)
            val pending=StudyWidgetStore.pending(context,snapshot.scope)
            val cards=StudyWidgetStore.available(deck,snapshot.scope,StudyWidgetStore.receipts(context))
            val locked=context.getSystemService(KeyguardManager::class.java).isDeviceLocked
            if(locked)return message(cards.size.toString()+" cards due · unlock to study",lockedState=true)
            prefs.getString("error",null)?.let {return message(it)}
            if(cards.isEmpty())return message(if(deck.tomorrow>0)"Next ${deck.tomorrow} cards tomorrow morning" else if(pending>0)"These cached cards are reviewed. Open RemoNook to apply your saved reviews and refresh this deck." else "No supported cards are ready in this cached deck. Open RemoNook to refresh.",pending>0||deck.doneToday>0||deck.tomorrow>0||deck.cards.isNotEmpty())
            val selected=cards.find {it.id==prefs.getString("cardId",null)&&it.fingerprint==prefs.getString("fingerprint",null)}
            val card=selected ?: cards.first().also {
                prefs.edit().putString("cardId",it.id).putString("fingerprint",it.fingerprint).putString("phase","question").putInt("part",0).putBoolean("grading",false).putBoolean("visible",!prefs.getBoolean("privacy",true)).commit()
            }
            return WidgetSuiteStudy.paint(context,id,snapshot,deck,card,token,width,height,
                {operation->action(context,id,token,operation)},open(context,id,deck.id,card.id,true))
        }
    }
}
