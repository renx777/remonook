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
import android.view.View
import android.widget.RemoteViews
import java.text.DateFormat
import java.util.Date

/** A native launcher widget. Reveal/pagination/review never launches MainActivity. */
class StudyWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { ids.forEach { render(context, it) } }
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) { render(context,id) }
    override fun onDeleted(context: Context, ids: IntArray) {
        ids.forEach { StudyWidgetStore.preferences(context,it).edit().clear().commit() }
        // Review evidence is independent of the launcher instance and is never deleted here.
    }
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context,intent)
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
                val pages=StudyWidgetPages.split(if(phase=="answer")card.answer else card.question,budget(context,id))
                val part=prefs.getInt("part",0).coerceIn(0,pages.lastIndex)
                when(val action=intent.getStringExtra("operation")) {
                    "UNHIDE" -> prefs.edit().putBoolean("visible",true).commit()
                    "REVEAL" -> if(part==pages.lastIndex) prefs.edit().putString("phase",if(phase=="answer")"question" else "answer").putInt("part",0).commit()
                    "QUESTION" -> prefs.edit().putString("phase","question").putInt("part",0).commit()
                    "PREVIOUS" -> prefs.edit().putInt("part",maxOf(0,part-1)).commit()
                    "PART" -> prefs.edit().putInt("part",minOf(pages.lastIndex,part+1)).commit()
                    "NEXT" -> {
                        val next=cards[(cards.indexOf(card)+1)%cards.size]
                        prefs.edit().putString("cardId",next.id).putString("fingerprint",next.fingerprint).putString("phase","question").putInt("part",0).putBoolean("visible",!prefs.getBoolean("privacy",true)).commit()
                    }
                    "AGAIN","HARD","GOOD","EASY" -> {
                        if(phase!="answer"||part!=pages.lastIndex) { render(context,id);return }
                        StudyWidgetStore.saveReview(context,snapshot,deck,card,action,prefs.getString("token",null)!!,id)
                        prefs.edit().remove("cardId").remove("fingerprint").putString("phase","question").putInt("part",0).putBoolean("visible",!prefs.getBoolean("privacy",true)).commit()
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
            val manager=AppWidgetManager.getInstance(context)
            manager.getAppWidgetIds(ComponentName(context,StudyWidgetProvider::class.java)).forEach { render(context,it) }
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
        private fun render(context: Context,id:Int) = synchronized(StudyWidgetStore.lock) {
            val views=RemoteViews(context.packageName,R.layout.study_widget)
            val prefs=StudyWidgetStore.preferences(context,id)
            val token=StudyWidgetStore.id()
            prefs.edit().putString("token",token).commit()
            views.setOnClickPendingIntent(R.id.widget_deck,configure(context,id))
            for(view in listOf(R.id.widget_parts,R.id.widget_review,R.id.widget_primary)) views.setViewVisibility(view,View.GONE)
            views.setTextViewText(R.id.widget_title,"")
            views.setTextViewText(R.id.widget_section,"")
            views.setTextViewText(R.id.widget_status,"")
            try {
                val snapshot=StudyWidgetStore.snapshot(context)
                val deck=snapshot.decks.find { it.id==prefs.getString("deckId",null) }
                val pending=snapshot.scope?.let { StudyWidgetStore.pending(context,it) } ?: 0
                val cached=if(snapshot.updatedAt>0)"Updated ${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(snapshot.updatedAt))}" else "Open RemoNook to refresh"
                views.setTextViewText(R.id.widget_status,prefs.getString("error",null) ?: if(pending>0)"$pending saved on device · pending app" else cached)
                if(snapshot.scope==null) {
                    views.setTextViewText(R.id.widget_body,"Open RemoNook and enable Study widgets in Settings. Your reviews stay on this device until the app applies them.")
                } else if(snapshot.scope!=prefs.getString("scope",null)||deck==null) {
                    views.setTextViewText(R.id.widget_body,"Choose a deck for this widget. If your account or workspace changed, choose it again.")
                } else {
                    val cards=StudyWidgetStore.available(deck,snapshot.scope,StudyWidgetStore.receipts(context))
                    views.setTextViewText(R.id.widget_title,"${snapshot.workspace} · ${deck.title}")
                    val opts=AppWidgetManager.getInstance(context).getAppWidgetOptions(id)
                    val height=opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,300)
                    val width=opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,300)
                    val fontScale=context.resources.configuration.fontScale
                    if(height<240 || height-210 < fontScale*60 || width-28 < fontScale*144) {
                        views.setTextViewText(R.id.widget_body,"Make this widget taller to read and review safely.")
                    } else if(cards.isEmpty()) {
                        views.setTextViewText(R.id.widget_body,if(pending>0)"These cached cards are reviewed. Open RemoNook to apply your saved reviews and refresh this deck." else "No supported cards are ready in this cached deck. Open RemoNook to refresh.")
                    } else {
                        val card=cards.find { it.id==prefs.getString("cardId",null)&&it.fingerprint==prefs.getString("fingerprint",null) } ?: cards.first().also {
                            prefs.edit().putString("cardId",it.id).putString("fingerprint",it.fingerprint).putString("phase","question").putInt("part",0).putBoolean("visible",!prefs.getBoolean("privacy",true)).commit()
                        }
                        val locked=context.getSystemService(KeyguardManager::class.java).isDeviceLocked
                        val visible=prefs.getBoolean("visible",!prefs.getBoolean("privacy",true))&&!locked
                        val phase=prefs.getString("phase","question") ?: "question"
                        val pages=StudyWidgetPages.split(if(phase=="answer")card.answer else card.question,budget(context,id))
                        val part=prefs.getInt("part",0).coerceIn(0,pages.lastIndex)
                        views.setTextViewText(R.id.widget_section,if(!visible)"PRIVATE" else if(phase=="answer")"ANSWER · ${cards.size} remaining" else "QUESTION · ${cards.size} remaining")
                        views.setTextViewText(R.id.widget_body,if(locked)"Unlock your device to study." else if(!visible)"Tap Show question when you are ready." else pages[part].trim())
                        val rating=visible&&phase=="answer"&&part==pages.lastIndex
                        views.setViewVisibility(R.id.widget_primary,if(rating)View.GONE else View.VISIBLE)
                        views.setTextViewText(R.id.widget_reveal,if(!visible)"Show question" else if(phase=="answer")"Show question" else "Reveal answer")
                        views.setOnClickPendingIntent(R.id.widget_reveal,action(context,id,token,if(!visible)"UNHIDE" else "REVEAL"))
                        views.setBoolean(R.id.widget_reveal,"setEnabled",!locked&&(!visible||part==pages.lastIndex))
                        views.setOnClickPendingIntent(R.id.widget_skip,action(context,id,token,"NEXT"))
                        views.setBoolean(R.id.widget_skip,"setEnabled",!locked)
                        views.setOnClickPendingIntent(R.id.widget_body,action(context,id,token,"QUESTION"))
                        if(visible&&pages.size>1&&!rating) {
                            views.setViewVisibility(R.id.widget_parts,View.VISIBLE)
                            views.setTextViewText(R.id.widget_page,"${part+1} / ${pages.size}")
                            views.setOnClickPendingIntent(R.id.widget_previous,action(context,id,token,"PREVIOUS"))
                            views.setOnClickPendingIntent(R.id.widget_next_part,action(context,id,token,"PART"))
                            views.setBoolean(R.id.widget_previous,"setEnabled",part>0)
                            views.setBoolean(R.id.widget_next_part,"setEnabled",part<pages.lastIndex)
                        }
                        if(rating) {
                            views.setViewVisibility(R.id.widget_review,View.VISIBLE)
                            for((view,grade)in listOf(R.id.widget_again to "AGAIN",R.id.widget_hard to "HARD",R.id.widget_good to "GOOD",R.id.widget_easy to "EASY"))views.setOnClickPendingIntent(view,action(context,id,token,grade))
                            views.setContentDescription(R.id.widget_body,"${pages[part].trim()}. Tap to read the question again.")
                        }
                    }
                }
            } catch(_:Exception) {
                views.setTextViewText(R.id.widget_body,"The study cache needs attention. Open RemoNook to refresh it. Saved review files have not been removed.")
            }
            AppWidgetManager.getInstance(context).updateAppWidget(id,views)
        }
    }
}
