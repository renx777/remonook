package com.remonook.app

import android.app.PendingIntent
import android.content.Context
import android.text.StaticLayout
import android.text.TextPaint
import android.view.View
import android.widget.RemoteViews

/** Subdivide the existing lossless character pages by actual rendered space.
 * Character budgets and canonical review/intent validation remain unchanged. */
internal object WidgetSuiteStudy {
    private fun size(width:Int,height:Int)=if(width<240||height<240)12f else 16f
    fun pages(context:Context,text:String,width:Int,height:Int,phase:String):List<String>{
        val scale=context.resources.configuration.fontScale
        val header=if(height>=200*scale)30*scale else 0f
        val footer=if(phase=="answer"&&height>=250*scale)96 else 48
        val status=if(height>260*scale)20*scale else 0f
        val available=maxOf(20f,height-12-footer-header-status)
        val paint=TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply{textSize=(if(phase=="answer")minOf(14f,size(width,height)) else size(width,height))*context.resources.displayMetrics.scaledDensity}
        val pixels=maxOf(1,((width-12)*context.resources.displayMetrics.density).toInt())
        val maxHeight=available*context.resources.displayMetrics.density
        fun fits(value:String)=StaticLayout.Builder.obtain(value,0,value.length,paint,pixels).setIncludePad(true).build().height<=maxHeight
        val result=mutableListOf<String>()
        for(part in StudyWidgetPages.split(text,StudyWidgetPages.contentBudget(width,height,scale))){
            var rest=part
            while(rest.isNotEmpty()){
                if(fits(rest)){result.add(rest);break}
                var end=0;var next=0
                while(next<rest.length){next+=Character.charCount(Character.codePointAt(rest,next));if(!fits(rest.substring(0,next)))break;end=next}
                if(end==0)end=Character.charCount(Character.codePointAt(rest,0))
                val word=rest.lastIndexOf(' ',end-1);if(word>0)end=word+1
                result.add(rest.substring(0,end));rest=rest.substring(end)
            }
        }
        return result.ifEmpty{listOf("No text")}
    }
    fun paint(context:Context,id:Int,snapshot:StudyWidgetStore.Snapshot,deck:StudyWidgetStore.Deck,card:StudyWidgetStore.Card,token:String,width:Int,height:Int,action:(String)->PendingIntent,voice:PendingIntent):RemoteViews{
        val prefs=StudyWidgetStore.preferences(context,id);val paint=WidgetPaint.effective(context,snapshot,prefs.getString("palette","app"))
        val v=RemoteViews(context.packageName,R.layout.widget_suite_study)
        paint.background(v,R.id.widget_root,"surface","28")
        val visible=prefs.getBoolean("visible",!prefs.getBoolean("privacy",true));val phase=prefs.getString("phase","question")?:"question"
        val pages=pages(context,if(phase=="answer")card.answer else card.question,width,height,phase)
        val part=prefs.getInt("part",0).coerceIn(0,pages.lastIndex)
        val rating=visible&&phase=="answer"&&part==pages.lastIndex&&(height>=250*context.resources.configuration.fontScale||prefs.getBoolean("grading",false))
        val tinyGrade=rating&&height<230*context.resources.configuration.fontScale
        fun text(view:Int,value:String,role:String="onSurface"){v.setTextViewText(view,value);paint.text(v,view,role)}
        fun button(view:Int,value:String,operation:String,role:String="primary",fg:String="onPrimary"){
            text(view,value,fg);paint.background(v,view,role,"pill");v.setContentDescription(view,value);v.setOnClickPendingIntent(view,action(operation))
        }
        v.setViewVisibility(R.id.widget_header,if(!tinyGrade&&height>=200*context.resources.configuration.fontScale)View.VISIBLE else View.GONE)
        text(R.id.widget_title,WidgetSuiteRendering.fit(context,deck.title+" · "+deck.cards.size+" due",width-12,1,11f),"eyebrow")
        text(R.id.widget_section,if(!visible)"Private" else if(phase=="answer")"Answer · ${part+1}/${pages.size}" else "${part+1}/${pages.size}","muted")
        val body=if(visible)pages[part] else "Tap to study"
        text(R.id.widget_body,body)
        v.setTextViewTextSize(R.id.widget_body,android.util.TypedValue.COMPLEX_UNIT_SP,if(phase=="answer")minOf(14f,size(width,height)) else size(width,height))
        v.setContentDescription(R.id.widget_content,if(visible&&phase=="answer")body+". Tap to read the question." else null)
        v.setOnClickPendingIntent(R.id.widget_content,if(visible&&phase=="answer")action("QUESTION") else if(!visible)action("UNHIDE") else null)
        v.setViewVisibility(R.id.widget_content,if(tinyGrade)View.GONE else View.VISIBLE)
        v.setViewVisibility(R.id.widget_primary,if(rating)View.GONE else View.VISIBLE)
        v.setViewVisibility(R.id.widget_review,if(rating&&!tinyGrade)View.VISIBLE else View.GONE)
        v.setViewVisibility(R.id.widget_grade_small,if(tinyGrade)View.VISIBLE else View.GONE)
        val operation=if(!visible)"UNHIDE" else if(part<pages.lastIndex)"PART" else if(phase=="question")"REVEAL" else "RATE"
        button(R.id.widget_reveal,when(operation){"UNHIDE"->"Show";"PART"->"Next";"REVEAL"->"Reveal";else->"Grade"},operation)
        if(operation=="PART")v.setContentDescription(R.id.widget_reveal,"Read next part · ${part+1} of ${pages.size}")
        v.setViewVisibility(R.id.widget_skip,if(width>=230)View.VISIBLE else View.GONE)
        button(R.id.widget_skip,"Next card","NEXT","surfaceAlt","onSurface")
        v.setViewVisibility(R.id.widget_voice,if(width>=300)View.VISIBLE else View.GONE)
        text(R.id.widget_voice,"Mic","onAccent");paint.background(v,R.id.widget_voice,"accent","pill")
        v.setOnClickPendingIntent(R.id.widget_voice,voice)
        val grades=listOf("AGAIN","HARD","GOOD","EASY")
        if(rating){
            if(tinyGrade){
                val grade=grades[prefs.getInt("gradeIndex",2).coerceIn(0,3)];val role=grade.lowercase()
                button(R.id.widget_grade_selected,grade.lowercase().replaceFirstChar{it.uppercase()},grade,if(grade=="EASY")"primary" else role+"Bg",if(grade=="EASY")"onPrimary" else role+"Fg")
                v.setContentDescription(R.id.widget_grade_selected,"Grade "+grade+" · "+(card.intervals[grade]?:""))
                button(R.id.widget_grade_other,"Other","OTHER_GRADE","surfaceAlt","onSurface")
            }else for((index,view)in listOf(R.id.widget_again,R.id.widget_hard,R.id.widget_good,R.id.widget_easy).withIndex()){
                val grade=grades[index];val role=grade.lowercase()
                val label=grade.lowercase().replaceFirstChar{it.uppercase()}
                button(view,label+(if(context.resources.configuration.fontScale<=1.2f&&!card.intervals[grade].isNullOrEmpty())"\n"+card.intervals[grade] else ""),grade,if(grade=="EASY")"primary" else role+"Bg",if(grade=="EASY")"onPrimary" else role+"Fg")
                v.setContentDescription(view,"Grade "+grade+" · "+(card.intervals[grade]?:""))
            }
        }
        val pending=StudyWidgetStore.pending(context,snapshot.scope!!)
        text(R.id.widget_status,if(pending>0)"$pending saved · pending app" else "","muted")
        v.setViewVisibility(R.id.widget_status,if(pending>0&&height>260*context.resources.configuration.fontScale)View.VISIBLE else View.GONE)
        return v
    }
}
