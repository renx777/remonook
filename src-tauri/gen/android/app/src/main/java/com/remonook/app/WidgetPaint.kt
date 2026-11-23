package com.remonook.app

import android.content.Context
import android.content.res.ColorStateList
import android.os.Build
import android.widget.RemoteViews

internal class WidgetPaint(val context:Context,val palette:String,val dynamic:Boolean=false) {
    companion object {
        val ids=listOf("marigold","iris","forest","graphite")
        val names=listOf("Marigold Ink","Electric Iris","Forest & Peach","Graphite & Coral")
        fun effective(context:Context,snapshot:StudyWidgetStore.Snapshot?,override:String?):WidgetPaint {
            val followsApp=override==null||override=="app"
            return WidgetPaint(context,palette(if(followsApp)snapshot?.palette else override),
                followsApp&&snapshot?.dynamic==true)
        }
        fun palette(value:String?)=value?.takeIf {it in ids} ?: "marigold"
    }
    private val dark get()=context.resources.configuration.uiMode and 48 == 32
    fun color(role:String):Int {
        if(dynamic&&Build.VERSION.SDK_INT>=31){
            val system=when(role){
                "surface"->if(dark)"neutral1_900" else "neutral1_10"
                "surfaceAlt"->if(dark)"accent1_800" else "accent1_50"
                "onSurface"->if(dark)"neutral1_50" else "neutral1_900"
                "muted"->if(dark)"neutral2_200" else "neutral2_700"
                "eyebrow"->if(dark)"accent1_200" else "accent1_600"
                "primary","hero"->if(dark)"accent1_200" else "accent1_600"
                "onPrimary","onHero"->if(dark)"accent1_800" else "accent1_0"
                "heroAccent"->if(dark)"accent1_800" else "accent1_0"
                "accent"->if(dark)"accent3_300" else "accent3_200"
                "onAccent"->"accent3_900"
                else->null
            }
            if(system!=null)return context.getColor(context.resources.getIdentifier("system_"+system,"color","android"))
        }
        return context.getColor(context.resources.getIdentifier("widget_"+palette+"_"+role.lowercase(),"color",context.packageName))
    }
    fun background(views:RemoteViews,id:Int,role:String,shape:String="16"){
        if(Build.VERSION.SDK_INT>=31){
            views.setInt(id,"setBackgroundResource",context.resources.getIdentifier("widget_shape_"+shape,"drawable",context.packageName))
            views.setColorStateList(id,"setBackgroundTintList",ColorStateList.valueOf(color(role)))
        }else views.setInt(id,"setBackgroundResource",context.resources.getIdentifier("widget_"+palette+"_"+role.lowercase()+"_"+shape,"drawable",context.packageName))
    }
    fun progress(views:RemoteViews,percent:Int){
        val bars=listOf(R.id.widget_progress_marigold,R.id.widget_progress_iris,R.id.widget_progress_forest,R.id.widget_progress_graphite)
        for((index,id)in bars.withIndex()){
            val selected=ids[index]==palette
            views.setViewVisibility(id,if(selected)android.view.View.VISIBLE else android.view.View.GONE)
            if(selected){
                views.setProgressBar(id,100,percent,false)
                if(Build.VERSION.SDK_INT>=31){
                    views.setColorStateList(id,"setProgressTintList",ColorStateList.valueOf(color("heroAccent")))
                    views.setColorStateList(id,"setProgressBackgroundTintList",ColorStateList.valueOf(color("outline")))
                }
            }
        }
    }
    fun text(views:RemoteViews,id:Int,role:String)=views.setTextColor(id,color(role))
}
