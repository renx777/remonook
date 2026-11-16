package com.remonook.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.content.res.ColorStateList
import android.view.View
import android.graphics.Color
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
        val content=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(24),dp(28),dp(24),dp(20));setBackgroundColor(getColor(R.color.study_widget_background)) }
        fun text(value:String,size:Float=15f) { content.addView(TextView(this).apply {text=value;textSize=size;setTextColor(getColor(R.color.study_widget_text));setPadding(0,dp(6),0,dp(14))}) }
        text("A little room to remember.",24f)
        text("Choose a flashcard deck for this home-screen widget. Reveal and grade here; reviews are saved privately on this device and applied when RemoNook runs.")
        try {
            val snapshot=StudyWidgetStore.snapshot(this)
            if(snapshot.scope==null||snapshot.decks.isEmpty()) {
                text("Open RemoNook, enable Study widgets in Settings and publish a supported flashcard deck. Then add or configure this widget again.")
                content.addView(Button(this).apply {setTextColor(getColor(R.color.study_widget_text));backgroundTintList=ColorStateList.valueOf(getColor(R.color.study_widget_button));text="Open RemoNook";setOnClickListener {startActivity(Intent(this@StudyWidgetConfigureActivity,MainActivity::class.java));finish()}})
            } else {
                text(snapshot.workspace)
                val prefs=StudyWidgetStore.preferences(this,id)
                val spinner=Spinner(this).apply {adapter=object:ArrayAdapter<String>(this@StudyWidgetConfigureActivity,android.R.layout.simple_spinner_dropdown_item,snapshot.decks.map { "${it.title} · ${it.cards.size} cached cards" }) {
                    override fun getView(position:Int,convertView:View?,parent:ViewGroup):View=super.getView(position,convertView,parent).apply {(this as? TextView)?.setTextColor(getColor(R.color.study_widget_text))}
                    override fun getDropDownView(position:Int,convertView:View?,parent:ViewGroup):View=super.getDropDownView(position,convertView,parent).apply {setBackgroundColor(getColor(R.color.study_widget_background));(this as? TextView)?.setTextColor(getColor(R.color.study_widget_text))}
                }}
                val selected=snapshot.decks.indexOfFirst {it.id==prefs.getString("deckId",null)}
                spinner.setSelection(maxOf(0,selected))
                content.addView(spinner,LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(56)))
                val privacy=CheckBox(this).apply {text="Keep text hidden until I tap Show question";isChecked=prefs.getBoolean("privacy",true);setTextColor(getColor(R.color.study_widget_text));setPadding(0,dp(12),0,dp(12))}
                content.addView(privacy)
                text("Question and answer text can be visible on your home screen. Only text cards are cached; unsupported media cards stay in the app.",13f)
                content.addView(Button(this).apply {setTextColor(getColor(R.color.study_widget_text));backgroundTintList=ColorStateList.valueOf(getColor(R.color.study_widget_button));text="Use this deck";setOnClickListener {
                    val current=try {StudyWidgetStore.snapshot(this@StudyWidgetConfigureActivity)}catch(_:Exception){null}
                    if(current?.scope!=snapshot.scope){finish();return@setOnClickListener}
                    prefs.edit().putString("scope",snapshot.scope).putString("deckId",snapshot.decks[spinner.selectedItemPosition].id).putBoolean("privacy",privacy.isChecked)
                        .putBoolean("visible",!privacy.isChecked).putString("phase","question").putInt("part",0).remove("cardId").remove("fingerprint").remove("error").commit()
                    StudyWidgetProvider.refreshAll(this@StudyWidgetConfigureActivity)
                    setResult(RESULT_OK,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));finish()
                }})
            }
        } catch(_:Exception) {
            text("The widget cache needs attention. Open RemoNook to refresh it. Existing saved review files are kept.")
        }
        setContentView(content)
    }
}
