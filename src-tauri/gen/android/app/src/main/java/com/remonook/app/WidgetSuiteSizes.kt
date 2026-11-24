package com.remonook.app

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.widget.RemoteViews
import kotlin.math.roundToInt

/** Launcher sizes are dp. MIN_HEIGHT is usually the landscape height, not the
 * height of the portrait widget. Never substitute fixed design breakpoints. */
internal object WidgetSuiteSizes {
    fun active(context:Context,options:Bundle):Pair<Int,Int>{
        val minW=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,180).coerceAtLeast(72)
        val minH=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,180).coerceAtLeast(72)
        val maxW=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,minW).coerceAtLeast(minW)
        val maxH=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,minH).coerceAtLeast(minH)
        return if(context.resources.configuration.orientation==Configuration.ORIENTATION_LANDSCAPE)maxW to minH else minW to maxH
    }
    fun views(context:Context,options:Bundle,paint:(Int,Int)->RemoteViews):RemoteViews {
        if(Build.VERSION.SDK_INT>=31){
            @Suppress("DEPRECATION")
            val supplied=options.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
            val sizes=supplied?.filter {it.width.isFinite()&&it.height.isFinite()&&it.width>0&&it.height>0}?.distinct()?.take(16)
            if(!sizes.isNullOrEmpty())return RemoteViews(sizes.associateWith {paint(it.width.roundToInt(),it.height.roundToInt())})
        }
        val (width,height)=active(context,options)
        return paint(width,height)
    }
}
