package com.remonook.app

import android.content.Context
import android.system.Os
import android.system.OsConstants
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/** Append-only actions share the private inbox, but never change review intents. */
internal object WidgetSuiteActions {
    fun queued(context:Context,scope:String,item:StudyWidgetStore.TodayItem):Boolean =
        File(StudyWidgetStore.directory(context),"inbox").listFiles()?.any {file->
            try {if(file.extension!="json"||file.length()>128*1024)false else {
                val event=JSONObject(file.readText())
                event.optString("type")=="complete"&&event.optString("scope")==scope&&event.optString("targetId")==item.id&&event.optString("fingerprint")==item.fingerprint&&event.optString("date")==item.date
            }}catch(_:Exception){false}
        } ?: false

    fun complete(context:Context,snapshot:StudyWidgetStore.Snapshot,item:StudyWidgetStore.TodayItem,eventId:String)=synchronized(StudyWidgetStore.lock){
        require(snapshot.scope!=null&&Regex("[a-fA-F0-9-]{36}").matches(eventId))
        if(item.done||queued(context,snapshot.scope,item))return@synchronized
        val root=StudyWidgetStore.directory(context)
        val dir=File(root,"inbox");require(dir.isDirectory||dir.mkdirs())
        val destination=File(dir,"$eventId.json")
        // Repeated delivery of one PendingIntent never overwrites either file.
        if(destination.exists()||File(root,"processed/$eventId.json").exists())return@synchronized
        val bytes=JSONObject().put("schema",1).put("type","complete").put("id",eventId).put("scope",snapshot.scope)
            .put("targetId",item.id).put("text",item.text).put("date",item.date).put("fingerprint",item.fingerprint)
            .put("at",System.currentTimeMillis()).toString().toByteArray(Charsets.UTF_8)
        require(bytes.size<=4096)
        val temporary=File(dir,".$eventId.${StudyWidgetStore.id()}.tmp")
        try {
            FileOutputStream(temporary).use {out->out.write(bytes);out.fd.sync()}
            // Same serialised no-replace protocol as Android review publication.
            if(!destination.exists())Os.rename(temporary.absolutePath,destination.absolutePath)
            val descriptor=Os.open(dir.absolutePath,OsConstants.O_RDONLY,0)
            try{Os.fsync(descriptor)}finally{Os.close(descriptor)}
        }finally{temporary.delete()}
    }
}
