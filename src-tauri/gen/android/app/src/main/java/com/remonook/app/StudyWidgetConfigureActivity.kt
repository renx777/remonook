package com.remonook.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.content.res.ColorStateList
import android.view.View
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.widget.ScrollView
import android.os.Bundle
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView

/** Launcher configuration is native and deliberately contains no account sign-in or tokens. */
class StudyWidgetConfigureActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        val id=intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if(id==AppWidgetManager.INVALID_APPWIDGET_ID||AppWidgetManager.getInstance(this).getAppWidgetInfo(id)?.provider!=ComponentName(this,StudyWidgetProvider::class.java)) { finish();return }
        val density=resources.displayMetrics.density
        fun dp(n:Int)=(n*density).toInt()
        val initial=try {StudyWidgetStore.snapshot(this)}catch(_:Exception){null}
        val paint=WidgetPaint.effective(this,initial,StudyWidgetStore.preferences(this,id).getString("palette","app"))
        val content=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(24),dp(28),dp(24),dp(20));setBackgroundColor(paint.color("surface")) }
        fun text(value:String,size:Float=15f) { content.addView(TextView(this).apply {text=value;textSize=size;setTextColor(paint.color("onSurface"));setPadding(0,dp(6),0,dp(14))}) }
        text("Study widget",24f)
        try {
            val snapshot=StudyWidgetStore.snapshot(this)
            if(snapshot.scope==null||snapshot.decks.isEmpty()) {
                text("Open RemoNook, enable Study widgets in Settings and publish a supported flashcard deck. Then add or configure this widget again.")
                content.addView(Button(this).apply {setTextColor(paint.color("onSurface"));backgroundTintList=ColorStateList.valueOf(paint.color("surfaceAlt"));text="Open RemoNook";setOnClickListener {startActivity(Intent(this@StudyWidgetConfigureActivity,MainActivity::class.java));finish()}})
            } else {
                text("Deck")
                val prefs=StudyWidgetStore.preferences(this,id)
                val spinner=Spinner(this).apply {adapter=object:ArrayAdapter<String>(this@StudyWidgetConfigureActivity,android.R.layout.simple_spinner_dropdown_item,snapshot.decks.map { "${it.title} · ${it.cards.size} cached cards" }) {
                    override fun getView(position:Int,convertView:View?,parent:ViewGroup):View=super.getView(position,convertView,parent).apply {(this as? TextView)?.setTextColor(paint.color("onSurface"))}
                    override fun getDropDownView(position:Int,convertView:View?,parent:ViewGroup):View=super.getDropDownView(position,convertView,parent).apply {setBackgroundColor(paint.color("surface"));(this as? TextView)?.setTextColor(paint.color("onSurface"))}
                }}
                val selected=snapshot.decks.indexOfFirst {it.id==prefs.getString("deckId",null)}
                spinner.setSelection(maxOf(0,selected))
                content.addView(spinner,LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(56)))
                text("Colours")
                var chosen=prefs.getString("palette","app") ?: "app"
                val swatches=mutableListOf<Button>()
                fun swatchBackground(value:String,selected:Boolean):LayerDrawable {
                    val colors=WidgetPaint(this,WidgetPaint.palette(if(value=="app")snapshot.palette else value))
                    val ring=GradientDrawable().apply {
                        shape=GradientDrawable.OVAL
                        setColor(paint.color("surface"))
                        if(selected)setStroke(dp(3),paint.color("onSurface"))
                    }
                    val circle=GradientDrawable().apply {
                        shape=GradientDrawable.OVAL
                        setColor(colors.color(if(value=="app")"surface" else "hero"))
                    }
                    val accent=GradientDrawable().apply {
                        shape=GradientDrawable.RECTANGLE
                        setColor(colors.color(if(value=="app")"surface" else "accent"))
                        cornerRadii=floatArrayOf(0f,0f,0f,0f,dp(28).toFloat(),dp(28).toFloat(),0f,0f)
                    }
                    return LayerDrawable(arrayOf(ring,circle,accent)).apply {
                        val inset=if(selected)dp(5) else 0
                        setLayerInset(1,inset,inset,inset,inset)
                        setLayerInset(2,dp(28),dp(28),inset,inset)
                    }
                }
                var row=LinearLayout(this)
                content.addView(row)
                for((i,value)in (listOf("app")+WidgetPaint.ids).withIndex()){
                    if(i==3){row=LinearLayout(this);content.addView(row)}
                    val name=if(value=="app")"App" else WidgetPaint.names[WidgetPaint.ids.indexOf(value)]
                    val tile=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL;setPadding(dp(4),dp(8),dp(4),dp(8))}
                    val circle=Button(this).apply {
                        tag=value;contentDescription=name;minWidth=dp(56);minHeight=dp(56);isAllCaps=false;isSelected=chosen==value
                        text=if(value=="app")"App" else "";textSize=12f;setTextColor(WidgetPaint(this@StudyWidgetConfigureActivity,if(value=="app")snapshot.palette else value).color(if(value=="app")"onSurface" else "onHero"))
                        background=swatchBackground(value,chosen==value)
                        setOnClickListener {
                            chosen=value
                            swatches.forEach {b->b.background=swatchBackground(b.tag as String,b.tag==chosen);b.isSelected=b.tag==chosen}
                        }
                    }
                    swatches.add(circle)
                    tile.addView(circle,LinearLayout.LayoutParams(dp(56),dp(56)))
                    tile.addView(TextView(this).apply {text=name;textSize=12f;setTextColor(paint.color("onSurface"));setPadding(0,dp(6),0,0)},LinearLayout.LayoutParams(dp(92),ViewGroup.LayoutParams.WRAP_CONTENT))
                    row.addView(tile,LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f))
                }
                text("“App” follows Settings → Study → Widgets. Pick a palette to give only this widget its own colours.",13f)
                val privacy=CheckBox(this).apply {text="Keep text hidden until I tap Show question";isChecked=prefs.getBoolean("privacy",true);setTextColor(paint.color("onSurface"));setPadding(0,dp(12),0,dp(12))}
                content.addView(privacy)
                text("Question and answer text can be visible on your home screen. Only text cards are cached; unsupported media cards stay in the app.",13f)
                content.addView(Button(this).apply {setTextColor(paint.color("onSurface"));backgroundTintList=ColorStateList.valueOf(paint.color("surfaceAlt"));text=if(prefs.contains("deckId"))"Save" else "Add widget";isAllCaps=false;textSize=16f;minHeight=dp(48);background=GradientDrawable().apply {cornerRadius=dp(28).toFloat();setColor(paint.color("primary"))};setTextColor(paint.color("onPrimary"));backgroundTintList=ColorStateList.valueOf(paint.color("primary"));setOnClickListener {
                    val current=try {StudyWidgetStore.snapshot(this@StudyWidgetConfigureActivity)}catch(_:Exception){null}
                    if(current?.scope!=snapshot.scope){finish();return@setOnClickListener}
                    prefs.edit().putString("palette",chosen).putString("scope",snapshot.scope).putString("deckId",snapshot.decks[spinner.selectedItemPosition].id).putBoolean("privacy",privacy.isChecked)
                        .putBoolean("visible",!privacy.isChecked).putString("phase","question").putInt("part",0).remove("cardId").remove("fingerprint").remove("error").commit()
                    StudyWidgetProvider.refreshAll(this@StudyWidgetConfigureActivity)
                    setResult(RESULT_OK,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));finish()
                }})
            }
        } catch(_:Exception) {
            text("The widget cache needs attention. Open RemoNook to refresh it. Existing saved review files are kept.")
        }
        setContentView(ScrollView(this).apply {setBackgroundColor(paint.color("surface"));addView(content)})
    }
}
