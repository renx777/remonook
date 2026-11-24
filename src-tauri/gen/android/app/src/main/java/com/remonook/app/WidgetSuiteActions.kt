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

    private fun pendingEvents(context:Context,scope:String):List<JSONObject> = File(StudyWidgetStore.directory(context),"inbox").listFiles()?.mapNotNull {file->
        try{if(file.extension!="json"||file.length()>128*1024)null else JSONObject(file.readText()).takeIf{it.optString("scope")==scope}}catch(_:Exception){null}
    }?:emptyList()
    private fun lastFocus(context:Context,scope:String,target:String?=null):JSONObject? {
        val events=pendingEvents(context,scope).filter{it.optString("type")=="focus"&&(target==null||it.optString("targetId")==target)}
        return events.filter{event->events.none{it.optString("previousId")==event.optString("id")}}.maxWithOrNull(compareBy<JSONObject>{it.optLong("at")}.thenBy{it.optString("id")})
    }
    fun effectiveFocus(context:Context,snapshot:StudyWidgetStore.Snapshot):StudyWidgetStore.Focus? {
        val event=snapshot.scope?.let{lastFocus(context,it)}?:return snapshot.focus
        val f=event.optJSONObject("after")?:return snapshot.focus
        return try{StudyWidgetStore.Focus(f.getString("id"),f.getBoolean("running"),f.getLong("endsAt"),f.getInt("remaining"),f.getString("label"),f.getString("cycle"),f.getString("mode"),f.getInt("duration"),f.getString("fingerprint"))}catch(_:Exception){snapshot.focus}
    }
    private fun publish(context:Context,event:JSONObject){
        val id=event.getString("id");require(Regex("[a-fA-F0-9-]{36}").matches(id))
        val root=StudyWidgetStore.directory(context);val dir=File(root,"inbox");require(dir.isDirectory||dir.mkdirs())
        val file=File(dir,"$id.json")
        if(file.exists()||File(root,"processed/$id.json").exists())return
        val bytes=event.toString().toByteArray(Charsets.UTF_8);require(bytes.size<=128*1024)
        val temporary=File(dir,".$id.${StudyWidgetStore.id()}.tmp")
        try{FileOutputStream(temporary).use{it.write(bytes);it.fd.sync()};require(!file.exists());Os.rename(temporary.absolutePath,file.absolutePath)
            val fd=Os.open(dir.absolutePath,OsConstants.O_RDONLY,0);try{Os.fsync(fd)}finally{Os.close(fd)}
        }finally{temporary.delete()}
    }
    fun focus(context:Context,snapshot:StudyWidgetStore.Snapshot,action:String)=synchronized(StudyWidgetStore.lock){
        val scope=snapshot.scope?:throw IllegalArgumentException("Choose a workspace first")
        val f=effectiveFocus(context,snapshot)?:throw IllegalArgumentException("Add a Dashboard focus timer first")
        require(action in listOf("start","pause","end")&&f.fingerprint.length==64){"Open RemoNook once to refresh the timer cache."}
        val at=System.currentTimeMillis();val previous=lastFocus(context,scope,f.id)
        val remaining=if(f.running)maxOf(0,Math.ceil((f.endsAt-at)/1000.0).toInt()) else f.remaining
        val next=when(action){
            "start"->if(f.running&&remaining>0)return@synchronized else f.copy(running=true,remaining=if(remaining>0)remaining else f.duration,endsAt=at+(if(remaining>0)remaining else f.duration)*1000L,cycle=if(remaining>0&&f.cycle.isNotEmpty())f.cycle else StudyWidgetStore.id())
            "pause"->if(!f.running)return@synchronized else f.copy(running=false,remaining=remaining,endsAt=0)
            else->f.copy(running=false,remaining=0,endsAt=0)
        }
        val after=JSONObject().put("id",next.id).put("running",next.running).put("endsAt",next.endsAt).put("remaining",next.remaining).put("label",next.label).put("cycle",next.cycle).put("mode",next.mode).put("duration",next.duration).put("fingerprint",next.fingerprint)
        publish(context,JSONObject().put("schema",1).put("type","focus").put("id",StudyWidgetStore.id()).put("scope",scope).put("targetId",f.id).put("action",action).put("baseFingerprint",previous?.optString("baseFingerprint")?:f.fingerprint).put("previousId",previous?.optString("id")?:JSONObject.NULL).put("nextCycle",next.cycle).put("at",at).put("after",after))
    }
    fun capture(context:Context,scope:String,text:String,eventId:String)=synchronized(StudyWidgetStore.lock){
        require(scope.isNotEmpty()&&text.isNotBlank()&&text.toByteArray(Charsets.UTF_8).size<=8000){"Keep captures under 8,000 bytes."}
        val root=StudyWidgetStore.directory(context)
        val existing=listOf(File(root,"inbox/$eventId.json"),File(root,"processed/$eventId.json")).firstOrNull{it.exists()}
        val id=if(existing!=null){val old=try{JSONObject(existing.readText())}catch(_:Exception){null};if(old?.optString("scope")==scope&&old.optString("text")==text)return@synchronized else StudyWidgetStore.id()}else eventId
        publish(context,JSONObject().put("schema",1).put("type","capture").put("id",id).put("scope",scope).put("text",text).put("at",System.currentTimeMillis()))
    }
}
