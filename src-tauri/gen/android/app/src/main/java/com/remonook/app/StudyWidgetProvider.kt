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
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) { render(context,id) }
    override fun onDeleted(context: Context, ids: IntArray) {
        ids.forEach { StudyWidgetStore.preferences(context,it).edit().clear().commit() }
        // Review evidence is independent of the launcher instance and is never deleted here.
    }
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context,intent)
        if(intent.action == Intent.ACTION_CONFIGURATION_CHANGED) { refreshAll(context);return }
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
        private fun render(context:Context,id:Int)=synchronized(StudyWidgetStore.lock) {
            val prefs=StudyWidgetStore.preferences(context,id)
            val token=StudyWidgetStore.id()
            prefs.edit().putString("token",token).commit()
            val options=AppWidgetManager.getInstance(context).getAppWidgetOptions(id)
            fun view(width:Int,height:Int):RemoteViews = paintView(context,id,token,width,height)
            val views=if(Build.VERSION.SDK_INT>=31)RemoteViews(mapOf(
                SizeF(110f,110f) to view(100,100),
                SizeF(160f,170f) to view(180,180),
                SizeF(260f,180f) to view(260,180),
                SizeF(260f,320f) to view(260,320)
            ))else view(options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,300),options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,300))
            AppWidgetManager.getInstance(context).updateAppWidget(id,views)
        }
        internal fun paintView(context:Context,id:Int,token:String,width:Int,height:Int):RemoteViews {
            val prefs=StudyWidgetStore.preferences(context,id)
            val snapshot=try {StudyWidgetStore.snapshot(context)}catch(_:Exception){null}
            val override=prefs.getString("palette","app")
            val paint=WidgetPaint.effective(context,snapshot,override)
            fun message(body:String,caught:Boolean=false,lockedState:Boolean=false,needsDeck:Boolean=false):RemoteViews {
                val v=RemoteViews(context.packageName,R.layout.study_widget_message)
                paint.background(v,R.id.widget_root,if(caught)"goodBg" else "surface","28")
                paint.text(v,R.id.widget_title,if(caught)"goodFg" else "eyebrow")
                paint.text(v,R.id.widget_body,if(caught)"goodFg" else "onSurface")
                paint.text(v,R.id.widget_status,if(caught)"goodFg" else "muted")
                paint.background(v,R.id.widget_deck,"primary","pill")
                paint.text(v,R.id.widget_deck,"onPrimary")
                v.setTextViewText(R.id.widget_title,if(caught)"✓  All caught up" else "RemoNook")
                for(bar in listOf(R.id.widget_private_1,R.id.widget_private_2)){
                    v.setViewVisibility(bar,if(lockedState)View.VISIBLE else View.GONE)
                    paint.background(v,bar,"outline","pill")
                }
                if(height<170||height<120*context.resources.configuration.fontScale){
                    v.setViewVisibility(R.id.widget_title,View.GONE)
                    v.setViewVisibility(R.id.widget_deck,View.GONE)
                    v.setTextViewTextSize(R.id.widget_body,android.util.TypedValue.COMPLEX_UNIT_SP,12f)
                    v.setOnClickPendingIntent(R.id.widget_root,configure(context,id))
                }
                v.setTextViewText(R.id.widget_body,if(height<170&&body.length>60)"Open RemoNook" else if(height<170&&context.resources.configuration.fontScale>1.3f)"Resize" else body)
                val pendingCount=snapshot?.scope?.let {StudyWidgetStore.pending(context,it)} ?: 0
                v.setTextViewText(R.id.widget_status,if(pendingCount>0)"$pendingCount saved on device · pending app" else "")
                v.setViewVisibility(R.id.widget_status,if(pendingCount>0&&height>=240)View.VISIBLE else View.GONE)
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
            if(width<260&&context.resources.configuration.fontScale>1.3f&&height<260)return message("Make this widget taller to study")
            if(width<160||height<170)return message("Make this widget wider to study")
            prefs.getString("error",null)?.let {return message(it)}
            if(cards.isEmpty())return message(if(deck.tomorrow>0)"Next ${deck.tomorrow} cards tomorrow morning" else if(pending>0)"These cached cards are reviewed. Open RemoNook to apply your saved reviews and refresh this deck." else "No supported cards are ready in this cached deck. Open RemoNook to refresh.",true)
            val selected=cards.find {it.id==prefs.getString("cardId",null)&&it.fingerprint==prefs.getString("fingerprint",null)}
            val card=selected ?: cards.first().also {
                prefs.edit().putString("cardId",it.id).putString("fingerprint",it.fingerprint).putString("phase","question").putInt("part",0).putBoolean("visible",!prefs.getBoolean("privacy",true)).commit()
            }
            val layout=if(context.resources.configuration.fontScale>1.3f&&layout(width,height)==R.layout.study_widget_full) R.layout.study_widget_full_accessible else layout(width,height)
            if(layout==R.layout.study_widget_glance){
                val v=RemoteViews(context.packageName,layout)
                paint.background(v,R.id.widget_root,"hero","28")
                paint.text(v,R.id.widget_title,"heroAccent");paint.text(v,R.id.widget_count,"onHero");paint.text(v,R.id.widget_body,"onHero")
                v.setTextViewText(R.id.widget_title,deck.title.uppercase())
                v.setTextViewText(R.id.widget_count,cards.size.toString())
                v.setTextViewText(R.id.widget_body,"cards due · about "+maxOf(1,cards.size/2)+" min")
                paint.progress(v,((deck.doneToday+deck.cards.size-cards.size)*100/maxOf(1,deck.doneToday+deck.cards.size)))
                v.setOnClickPendingIntent(R.id.widget_root,open(context,id,deck.id))
                return v
            }
            val scale=context.resources.configuration.fontScale
            // Preserve the existing character budget. When controls cannot fit, ask for more room.
            if(height<160||width-32<scale*144||height<120+scale*48)return message("Make this widget taller to read and review safely.")
            val v=RemoteViews(context.packageName,layout)
            paint.background(v,R.id.widget_root,"surface","28")
            for(view in listOf(R.id.widget_title,R.id.widget_section))paint.text(v,view,"eyebrow")
            for(view in listOf(R.id.widget_body,R.id.widget_question))paint.text(v,view,"onSurface")
            for(view in listOf(R.id.widget_page,R.id.widget_recall,R.id.widget_status))paint.text(v,view,"muted")
            v.setOnClickPendingIntent(R.id.widget_deck,configure(context,id))
            v.setViewVisibility(R.id.widget_deck,View.GONE)
            v.setOnClickPendingIntent(R.id.widget_root,configure(context,id))
            for(view in listOf(R.id.widget_deck,R.id.widget_skip,R.id.widget_previous,R.id.widget_next_part)){
                paint.background(v,view,"surfaceAlt","pill");paint.text(v,view,"onSurface")
            }
            paint.background(v,R.id.widget_reveal,"primary","pill");paint.text(v,R.id.widget_reveal,"onPrimary")
            paint.background(v,R.id.widget_voice,"accent","pill");paint.text(v,R.id.widget_voice,"onAccent")
            v.setContentDescription(R.id.widget_voice,"Answer aloud")
            v.setOnClickPendingIntent(R.id.widget_voice,open(context,id,deck.id,card.id,true))
            for(view in listOf(R.id.widget_parts,R.id.widget_review,R.id.widget_recall,R.id.widget_question))v.setViewVisibility(view,View.GONE)
            v.setTextViewText(R.id.widget_title,deck.title.uppercase()+" · "+cards.size+" DUE")
            val visible=prefs.getBoolean("visible",!prefs.getBoolean("privacy",true))
            val phase=prefs.getString("phase","question") ?: "question"
            val pages=StudyWidgetPages.split(if(phase=="answer")card.answer else card.question,budget(context,id))
            val padding=if(visible&&phase=="answer")(8*context.resources.displayMetrics.density).toInt() else 0
            v.setViewPadding(R.id.widget_body,padding,padding,padding,padding)
            if(visible&&pages.size>1){
                v.setViewVisibility(R.id.widget_header,View.GONE)
                if(height<160+scale*20)return message("Make this widget taller to read every text part.")
            }
            if(visible&&phase=="answer"&&height<190*scale)return message("Make this widget taller to review safely.")
            val part=prefs.getInt("part",0).coerceIn(0,pages.lastIndex)
            v.setTextViewText(R.id.widget_section,if(!visible)"Private" else if(pages.size>1)deck.title.uppercase()+" · "+cards.size+" DUE" else if(phase=="answer")"Answer" else (cards.indexOf(card)+1).toString()+" / "+cards.size)
            val bodyText=if(!visible)"Tap Show question when you are ready." else pages[part].trim()
            val styled=android.text.SpannableString(bodyText)
            if(phase!="answer")styled.setSpan(android.text.style.StyleSpan(android.graphics.Typeface.BOLD),0,styled.length,android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            v.setTextViewText(R.id.widget_body,styled)
            v.setTextViewTextSize(R.id.widget_body,android.util.TypedValue.COMPLEX_UNIT_SP,if(phase=="answer")14f else 16f)
            if(visible&&phase=="answer")paint.background(v,R.id.widget_body,"surfaceAlt")
            v.setViewVisibility(R.id.widget_status,if(pending>0)View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.widget_status,if(pending>0)"$pending saved on device · pending app" else "")
            val rating=visible&&phase=="answer"&&part==pages.lastIndex
            if(rating&&height<240+scale*70)return message("Make this widget taller to review safely.")
            if(visible&&!rating&&pages.size>1&&layout==R.layout.study_widget_prompt){
                val controls=maxOf(48f,12*scale*1.5f+12)
                val available=height-32-18*scale-2*controls-(if(pending>0)18*scale else 0f)
                val measured=textLayout(context,bodyText,width-32,if(phase=="answer")14f else 16f,phase!="answer")
                if(measured.height>available*context.resources.displayMetrics.density)
                    return message("Make this widget taller to read every text part.")
            }
            v.setViewVisibility(R.id.widget_primary,if(rating)View.GONE else View.VISIBLE)
            v.setTextViewText(R.id.widget_reveal,if(!visible||phase=="answer")"Show question" else "Reveal answer")
            v.setOnClickPendingIntent(R.id.widget_reveal,action(context,id,token,if(!visible)"UNHIDE" else "REVEAL"))
            v.setBoolean(R.id.widget_reveal,"setEnabled",!visible||part==pages.lastIndex)
            v.setOnClickPendingIntent(R.id.widget_skip,action(context,id,token,"NEXT"))
            v.setOnClickPendingIntent(R.id.widget_content,if(visible&&phase=="answer")action(context,id,token,"QUESTION") else null)
            if(visible&&pages.size>1&&!rating){
                v.setViewVisibility(R.id.widget_parts,View.VISIBLE)
                v.setTextViewText(R.id.widget_page,"${part+1} / ${pages.size}")
                v.setOnClickPendingIntent(R.id.widget_previous,action(context,id,token,"PREVIOUS"))
                v.setOnClickPendingIntent(R.id.widget_next_part,action(context,id,token,"PART"))
                v.setBoolean(R.id.widget_previous,"setEnabled",part>0)
                v.setBoolean(R.id.widget_next_part,"setEnabled",part<pages.lastIndex)
            }
            if(visible&&phase=="answer"&&height>400&&scale<=1.3f&&textLayout(context,card.question,width-32,16f,true).lineCount<=3){
                v.setViewVisibility(R.id.widget_section,View.GONE)
                v.setViewVisibility(R.id.widget_question,View.VISIBLE)
                v.setTextViewText(R.id.widget_question,card.question)
            }
            if(rating){
                v.setViewVisibility(R.id.widget_review,View.VISIBLE)
                v.setViewVisibility(R.id.widget_recall,View.VISIBLE)
                for((view,grade)in listOf(R.id.widget_again to "AGAIN",R.id.widget_hard to "HARD",R.id.widget_good to "GOOD",R.id.widget_easy to "EASY")){
                    v.setTextViewText(view,grade.lowercase().replaceFirstChar {it.uppercase()}+"\n"+(card.intervals[grade] ?: ""))
                    val role=grade.lowercase()
                    paint.background(v,view,if(grade=="EASY")"primary" else role+"Bg")
                    paint.text(v,view,if(grade=="EASY")"onPrimary" else role+"Fg")
                    v.setOnClickPendingIntent(view,action(context,id,token,grade))
                }
                v.setContentDescription(R.id.widget_content,"${pages[part].trim()}. Tap to read the question again.")
            }
            return v
        }
    }
}
