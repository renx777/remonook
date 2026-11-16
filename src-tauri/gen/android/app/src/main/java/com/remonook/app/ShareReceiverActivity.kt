package com.remonook.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import android.system.Os
import android.system.OsConstants

/** Android share target; queues before opening the app, without reading clipboard or URLs. */
class ShareReceiverActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if(savedInstanceState!=null){finish();return}
        try {
            require(intent.action==Intent.ACTION_SEND || intent.action==Intent.ACTION_PROCESS_TEXT)
            val text=(if(intent.action==Intent.ACTION_PROCESS_TEXT)intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)else intent.getCharSequenceExtra(Intent.EXTRA_TEXT))?.toString().orEmpty()
            require(text.isNotBlank()) { "This share contains no text or link. Share selected text or a web address." }
            require(text.toByteArray(Charsets.UTF_8).size<=256*1024) { "This share is too large. Select a shorter passage and share it again. Nothing was saved." }
            val subject=intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty()
            require(subject.toByteArray(Charsets.UTF_8).size<=4096) { "The shared title is too long. Share selected text instead." }
            val id=UUID.randomUUID().toString()
            val dir=File(applicationInfo.dataDir,"remonook-shares/inbox").apply {require(isDirectory||mkdirs())}
            val tmp=File(dir,"$id.tmp");val target=File(dir,"$id.json")
            val value=JSONObject().put("schema",1).put("id",id).put("text",text).put("subject",subject).put("receivedAt",System.currentTimeMillis())
            val bytes=value.toString().toByteArray(Charsets.UTF_8)
            val pending=dir.listFiles().orEmpty()
            require(pending.size<64 && pending.sumOf {it.length()}+bytes.size<=8*1024*1024) { "Your incoming share queue is full. Open RemoNook and finish saving pending shares, then share this passage again. Nothing new was saved." }
            FileOutputStream(tmp).use {it.write(bytes);it.fd.sync()}
            Os.link(tmp.absolutePath,target.absolutePath)
            val fd=Os.open(dir.absolutePath,OsConstants.O_RDONLY,0)
            try {Os.fsync(fd)}finally {Os.close(fd)}
            tmp.delete()
            startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            finish()
        } catch(error:Exception) {
            AlertDialog.Builder(this).setTitle("Could not receive this share")
                .setMessage(error.message?:"Your original remains in the sharing app. Please try again.")
                .setPositiveButton("Close"){_,_->finish()}.setOnCancelListener {finish()}.show()
        }
    }
}
