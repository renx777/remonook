package com.remonook.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView

/** Every instance follows App or keeps its own palette; no sign-in or credentials. */
class WidgetSuiteConfigureActivity:Activity(){
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        val id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1)
        val kind=WidgetSuiteRendering.kind(this,id) ?: run{finish();return}
        val prefs=StudyWidgetStore.preferences(this,id)
        val snapshot=try{StudyWidgetStore.snapshot(this)}catch(_:Exception){null}
        val paint=WidgetPaint.effective(this,snapshot,prefs.getString("palette","app"))
        fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
        val content=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL;setPadding(dp(24),dp(28),dp(24),dp(24));setBackgroundColor(paint.color("surface"))}
        fun text(value:String,size:Float=14f){content.addView(TextView(this).apply{text=value;textSize=size;setTextColor(paint.color("onSurface"));setPadding(0,dp(8),0,dp(16))})}
        text(WidgetSuiteRendering.names[kind]?:"RemoNook widget",24f)
        text("Colours",16f)
        val radio=RadioGroup(this)
        val options=listOf("app")+WidgetPaint.ids
        for((index,value)in options.withIndex()){
            val name=if(value=="app")"App · follow my widget colours" else WidgetPaint.names[WidgetPaint.ids.indexOf(value)]
            radio.addView(RadioButton(this).apply {
                this.id=index+1;text=name;textSize=16f;minHeight=dp(56);setPadding(dp(8),dp(8),dp(8),dp(8));setTextColor(paint.color("onSurface"))
                buttonTintList=ColorStateList.valueOf(paint.color("primary"));contentDescription=name
            },LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        radio.check(options.indexOf(prefs.getString("palette","app")).coerceAtLeast(0)+1)
        content.addView(radio)
        text("App follows Settings → Study → Widget colours. A palette here changes only this widget.")
        val privacy=CheckBox(this).apply {text="Keep note text private on the home screen";minHeight=dp(48);setTextColor(paint.color("onSurface"));isChecked=prefs.getBoolean("privacy",false)}
        content.addView(privacy)
        text("Note text is always hidden while the device is locked. This widget uses the workspace currently enabled in RemoNook.")
        if(kind=="capture")text("Speak and Photo open the app’s existing tools. Text capture works offline; AI voice and photo need sign-in.")
        if(kind=="resurface")text("Uses your existing meaning-search index. Enable meaning search in RemoNook to see notes and connections.")
        val ready=snapshot?.scope!=null
        if(!ready)text("Open RemoNook and enable widgets in Settings → Study first. Your existing saved actions are kept.")
        content.addView(Button(this).apply {
            text=if(ready)if(prefs.contains("scope"))"Save" else "Add widget" else "Open RemoNook"
            isAllCaps=false;minHeight=dp(48);textSize=16f;setTextColor(paint.color("onPrimary"));background=GradientDrawable().apply {cornerRadius=dp(28).toFloat();setColor(paint.color("primary"))};backgroundTintList=ColorStateList.valueOf(paint.color("primary"))
            setOnClickListener {
                if(!ready){startActivity(Intent(this@WidgetSuiteConfigureActivity,MainActivity::class.java));finish();return@setOnClickListener}
                val current=try{StudyWidgetStore.snapshot(this@WidgetSuiteConfigureActivity)}catch(_:Exception){null}
                if(current?.scope!=snapshot?.scope||current?.scope==null){finish();return@setOnClickListener}
                if(!prefs.edit().putString("scope",current.scope).putString("palette",options[(radio.checkedRadioButtonId-1).coerceIn(0,4)]).putBoolean("privacy",privacy.isChecked).remove("suite-error").commit())return@setOnClickListener
                WidgetSuiteRendering.render(this@WidgetSuiteConfigureActivity,id,kind)
                setResult(RESULT_OK,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));finish()
            }
        },LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(ScrollView(this).apply{setBackgroundColor(paint.color("surface"));addView(content)})
    }
}
