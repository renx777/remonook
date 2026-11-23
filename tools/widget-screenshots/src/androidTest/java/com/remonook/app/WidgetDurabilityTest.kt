package com.remonook.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File
import org.json.JSONObject

/** Uses Android's actual Os.rename/open/fsync, not the Robolectric filesystem. */
@RunWith(AndroidJUnit4::class)
class WidgetDurabilityTest {
    @Test fun publishRetryArchiveAndDeletionPreserveTheAction(){
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val root=StudyWidgetStore.directory(context).apply{mkdirs()}
        val date=WidgetSuiteRendering.date(System.currentTimeMillis())
        val item=StudyWidgetStore.TodayItem("bullet:task","Read one chapter","",false,date,"a".repeat(64))
        val snapshot=StudyWidgetStore.Snapshot("test-workspace","Notes",1,System.currentTimeMillis(),emptyList(),today=listOf(item))
        val event=StudyWidgetStore.id()
        WidgetSuiteActions.complete(context,snapshot,item,event)
        val file=File(root,"inbox/$event.json");assertTrue(file.isFile)
        val saved=file.readText();val parsed=JSONObject(saved)
        assertEquals("complete",parsed.getString("type"));assertEquals("test-workspace",parsed.getString("scope"))
        assertTrue(WidgetSuiteActions.queued(context,"test-workspace",item))
        assertFalse(WidgetSuiteActions.queued(context,"other-workspace",item))
        WidgetSuiteActions.complete(context,snapshot,item,event);assertEquals(saved,file.readText())
        // Model a broker archive, then replay the original PendingIntent.
        val processed=File(root,"processed/$event.json").apply{parentFile.mkdirs()}
        assertTrue(file.renameTo(processed))
        WidgetSuiteActions.complete(context,snapshot,item,event)
        assertFalse(file.exists());assertEquals(saved,processed.readText())
        TodayWidgetProvider().onDeleted(context,intArrayOf(778))
        assertEquals(saved,processed.readText())
        assertFalse(File(root,"inbox").listFiles()!!.any{it.extension=="tmp"})
    }
    @Test fun collidingEventCannotReplaceExistingEvidence(){
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val root=StudyWidgetStore.directory(context).apply{mkdirs()}
        val id=StudyWidgetStore.id()
        val existing=File(root,"inbox/$id.json").apply{parentFile.mkdirs();writeText("Original immutable evidence")}
        val item=StudyWidgetStore.TodayItem("bullet:another","Another note","",false,WidgetSuiteRendering.date(System.currentTimeMillis()),"b".repeat(64))
        WidgetSuiteActions.complete(context,StudyWidgetStore.Snapshot("test-workspace","Notes",1,1,emptyList()),item,id)
        assertEquals("Original immutable evidence",existing.readText())
    }
}
