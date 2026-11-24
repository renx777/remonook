package com.remonook.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.ColorStateList
import android.os.Bundle
import android.speech.RecognizerIntent
import android.text.Editable
import android.text.TextWatcher
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/** A small native capture surface, independent of Tauri or the main app process. */
class WidgetSuiteCaptureActivity:Activity(){
    private var editor:EditText?=null
    private var owner=""
    private var event=""
    private var saving=false
    override fun onCreate(state:Bundle?){
        super.onCreate(state)
        val snapshot=try{StudyWidgetStore.snapshot(this)}catch(_:Exception){null}
        owner=intent.getStringExtra("scope")?:snapshot?.scope?:""
        if(owner.isEmpty()||snapshot?.scope!=owner){Toast.makeText(this,"Open the original workspace to capture a note.",Toast.LENGTH_LONG).show();finish();return}
        val drafts=getSharedPreferences("widget-capture-drafts",MODE_PRIVATE)
        event=state?.getString("event")?:drafts.getString("id:$owner",null)?:StudyWidgetStore.id()
        drafts.edit().putString("id:$owner",event).commit()
        val paint=WidgetPaint.effective(this,snapshot,"app")
        fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
        val content=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(20),dp(20),dp(20));setBackgroundColor(paint.color("surface"))}
        content.addView(TextView(this).apply{text="Quick capture";textSize=22f;setTextColor(paint.color("onSurface"))})
        content.addView(TextView(this).apply{text="Inbox · "+snapshot.workspace;textSize=12f;setTextColor(paint.color("muted"));setPadding(0,dp(6),0,dp(12))})
        val field=EditText(this).apply{hint="Catch a thought…";textSize=16f;minLines=3;maxLines=9;gravity=android.view.Gravity.TOP;setTextColor(paint.color("onSurface"));setHintTextColor(paint.color("muted"));backgroundTintList=ColorStateList.valueOf(paint.color("primary"));setText(state?.getString("text")?:drafts.getString("text:$owner","")?:"");contentDescription="Capture text"}
        editor=field;content.addView(field,LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT))
        field.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){drafts.edit().putString("text:$owner",s.toString()).commit()};override fun afterTextChanged(s:Editable?){} })
        val error=TextView(this).apply{setTextColor(paint.color("onSurface"));textSize=13f};content.addView(error)
        val row=LinearLayout(this)
        fun button(label:String,primary:Boolean=false,run:()->Unit){row.addView(Button(this).apply{text=label;isAllCaps=false;minHeight=dp(48);setTextColor(paint.color(if(primary)"onPrimary" else "onSurface"));backgroundTintList=ColorStateList.valueOf(paint.color(if(primary)"primary" else "surfaceAlt"));setOnClickListener{run()}},LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f))}
        button("Speak"){speak()}
        button("Photo"){startActivity(Intent(this,MainActivity::class.java).setData(android.net.Uri.Builder().scheme("remonook").authority("capture").appendQueryParameter("scope",owner).appendQueryParameter("mode","photo").build()));finish()}
        button("Save",true){if(!saving){saving=true;try{WidgetSuiteActions.capture(this,owner,field.text.toString(),event);drafts.edit().remove("id:$owner").remove("text:$owner").commit();WidgetSuiteRendering.refreshAll(this);Toast.makeText(this,"Saved on device · pending app",Toast.LENGTH_LONG).show();finish()}catch(e:Exception){error.text=e.message?:"Could not save. Your draft is kept here.";saving=false}}}
        content.addView(row)
        content.addView(TextView(this).apply{text="Drafts stay on this device. Saved captures join Inbox when RemoNook next runs.";textSize=12f;setTextColor(paint.color("muted"));setPadding(0,dp(12),0,0)})
        setContentView(ScrollView(this).apply{setBackgroundColor(paint.color("surface"));addView(content)})
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        if(intent.getStringExtra("mode")=="voice"&&state==null)speak() else {field.requestFocus();window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)}
    }
    override fun onStart(){super.onStart();window.setLayout(minOf(resources.displayMetrics.widthPixels-32,(420*resources.displayMetrics.density).toInt()),ViewGroup.LayoutParams.WRAP_CONTENT)}
    private fun speak(){try{@Suppress("DEPRECATION") startActivityForResult(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_PROMPT,"Speak a note"),4)}catch(_:ActivityNotFoundException){Toast.makeText(this,"Speech input is unavailable. You can type your note here.",Toast.LENGTH_LONG).show()}}
    @Deprecated("Android activity callback")
    override fun onActivityResult(request:Int,result:Int,data:Intent?){super.onActivityResult(request,result,data);if(request==4&&result==RESULT_OK){val text=data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?:return;editor?.let{it.setText(it.text.toString().trimEnd()+(if(it.text.isNotEmpty())"\n" else "")+text);it.setSelection(it.text.length)}}}
    override fun onSaveInstanceState(state:Bundle){state.putString("event",event);state.putString("text",editor?.text?.toString());super.onSaveInstanceState(state)}
}
