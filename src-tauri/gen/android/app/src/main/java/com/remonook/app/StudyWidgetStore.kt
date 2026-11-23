package com.remonook.app

import android.content.Context
import android.content.SharedPreferences
import android.system.Os
import android.system.OsConstants
import android.system.ErrnoException
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/** Private exchange with the Rust broker. It contains content, never authentication tokens. */
internal object StudyWidgetStore {
    val lock = Any()
    const val SCHEMA = 1
    data class Card(val id: String, val fingerprint: String, val question: String, val answer: String, val intervals:Map<String,String> = emptyMap())
    data class Deck(val id: String, val title: String, val cards: List<Card>, val doneToday:Int=0,val tomorrow:Int=0)
    data class Snapshot(val scope: String?, val workspace: String, val revision: Long, val updatedAt: Long, val decks: List<Deck>, val palette:String="marigold", val dynamic:Boolean=false)
    data class Receipt(val id: String, val scope: String, val cardId: String, val fingerprint: String)
    fun directory(context: Context) = File(context.applicationInfo.dataDir, "remonook-study-widget")
    fun preferences(context: Context, id: Int): SharedPreferences = context.getSharedPreferences("study-widget-$id", Context.MODE_PRIVATE)
    fun id() = UUID.randomUUID().toString()
    private fun text(o: JSONObject, key: String, limit: Int): String {
        val value = o.getString(key)
        require(value.toByteArray(Charsets.UTF_8).size <= limit)
        return value
    }
    fun snapshot(context: Context): Snapshot {
        val file = File(directory(context), "snapshot.json")
        if (!file.isFile) return Snapshot(null, "", 0, 0, emptyList())
        require(file.length() <= 4 * 1024 * 1024) { "Widget cache is too large. Open RemoNook to refresh it." }
        val root = JSONObject(file.readText())
        require(root.getInt("schema") in 1..2)
        if (root.isNull("scope")) return Snapshot(null, "", root.optLong("revision"), root.optLong("updatedAt"), emptyList())
        val scope = text(root, "scope", 200)
        require(scope.isNotBlank())
        val list = root.getJSONArray("decks")
        require(list.length() <= 100)
        val decks = (0 until list.length()).map { i ->
            val d = list.getJSONObject(i)
            val cards = d.getJSONArray("cards")
            require(cards.length() <= 30)
            Deck(text(d,"id",200), text(d,"title",1000), (0 until cards.length()).map { j ->
                val c = cards.getJSONObject(j)
                Card(text(c,"id",200),text(c,"fingerprint",200),text(c,"question",20000),text(c,"answer",80000),listOf("AGAIN","HARD","GOOD","EASY").associateWith {c.optJSONObject("intervals")?.optString(it,"") ?: ""})
            },d.optInt("doneToday",0).coerceAtLeast(0),d.optInt("tomorrow",0).coerceAtLeast(0))
        }
        return Snapshot(scope, root.optString("workspaceName", "Workspace"),root.getLong("revision"),root.getLong("updatedAt"),decks,WidgetPaint.palette(root.optJSONObject("appearance")?.optString("palette")),root.optJSONObject("appearance")?.optBoolean("dynamic",false) ?: false)
    }
    /** Both pending and archived receipts exclude this exact scheduled-card version. A new
     * canonical fingerprint releases it, without relying on device clocks or update order. */
    private fun remember(context: Context, event: Receipt) {
        val prefs=context.getSharedPreferences("study-widget-receipts",Context.MODE_PRIVATE)
        val list=JSONArray(prefs.getString("index","[]"))
        if((0 until list.length()).any { list.getJSONObject(it).optString("id")==event.id }) return
        list.put(JSONObject().put("id",event.id).put("scope",event.scope).put("cardId",event.cardId).put("fingerprint",event.fingerprint))
        require(prefs.edit().putString("index",list.toString()).commit()) { "Could not save review metadata." }
    }
    fun receipts(context: Context): List<Receipt> {
        val prefs=context.getSharedPreferences("study-widget-receipts",Context.MODE_PRIVATE)
        val list=try { JSONArray(prefs.getString("index","[]")) } catch(_:Exception) { JSONArray() }
        val published=snapshot(context)
        val active=published.decks.flatMap { d-> d.cards.map { c-> Triple(published.scope,c.id,c.fingerprint) } }.toSet()
        val retained=JSONArray()
        val receipts=(0 until list.length()).mapNotNull { i ->
            try {
                val value=list.getJSONObject(i)
                val receipt=Receipt(value.getString("id"),value.getString("scope"),value.getString("cardId"),value.getString("fingerprint"))
                if(!Regex("[A-Za-z0-9_-]{1,128}").matches(receipt.id)) null else {
                    val pending=File(directory(context),"inbox/${receipt.id}.json").exists()
                    if(pending||active.contains(Triple(receipt.scope,receipt.cardId,receipt.fingerprint)))retained.put(value)
                    if(pending||File(directory(context),"processed/${receipt.id}.json").exists())receipt else null
                }
            } catch(_:Exception) { null }
        }.toMutableList()
        prefs.edit().putString("index",retained.toString()).commit()
        // Pending intents from another native surface are also excluded. Archived history is
        // indexed, never scanned in full on the launcher thread as years of reviews grow.
        File(directory(context),"inbox").listFiles()?.filter { it.isFile && it.extension=="json" && it.length()<=128*1024 }?.forEach { file ->
            try { val e=JSONObject(file.readText());if(e.optInt("schema")==SCHEMA)receipts.add(Receipt(e.getString("id"),e.getString("scope"),e.getString("cardId"),e.getString("fingerprint"))) }catch(_:Exception){}
        }
        return receipts
    }
    fun pending(context: Context, scope: String): Int = File(directory(context), "inbox").listFiles()?.count { file ->
        try { file.extension == "json" && file.length() <= 128*1024 && JSONObject(file.readText()).optString("scope") == scope } catch (_:Exception) { false }
    } ?: 0
    fun available(deck: Deck, scope: String, receipts: List<Receipt>) = deck.cards.filter { card ->
        receipts.none { it.scope == scope && it.cardId == card.id && it.fingerprint == card.fingerprint }
    }
    /** Provider actions are serialized under lock. Publish a fully fsynced temp file using
     * atomic no-overwrite hard link; the broker ignores .tmp files. Existing IDs are never overwritten. */
    fun saveReview(context: Context, snapshot: Snapshot, deck: Deck, card: Card, grade: String, eventId: String, widgetId: Int): Boolean = synchronized(lock) {
        require(snapshot.scope != null && grade in listOf("AGAIN","HARD","GOOD","EASY"))
        require(Regex("[A-Za-z0-9_-]{1,128}").matches(eventId))
        val dir = File(directory(context), "inbox"); require(dir.isDirectory || dir.mkdirs())
        val file = File(dir, "$eventId.json")
        if (file.exists() || File(directory(context), "processed/$eventId.json").exists()) return@synchronized false
        // Commit the receipt reference before publication. It only excludes a card if its
        // immutable inbox/processed file exists, making crashes on either side safe.
        remember(context,Receipt(eventId,snapshot.scope,card.id,card.fingerprint))
        val json = JSONObject().put("schema", SCHEMA).put("id",eventId).put("scope",snapshot.scope)
            .put("deckId",deck.id).put("cardId",card.id).put("fingerprint",card.fingerprint).put("grade",grade)
            .put("reviewedAt",System.currentTimeMillis()).put("question",card.question).put("answer",card.answer)
            .put("widgetId",widgetId.toString()).toString().toByteArray(Charsets.UTF_8)
        require(json.size <= 128*1024)
        val temporary = File(dir,".$eventId.${id()}.tmp")
        try {
            FileOutputStream(temporary).use { out -> out.write(json); out.fd.sync() }
            // Android forbids hard links in app storage (EACCES). This block holds the store's lock and
            // checked above that no event with this id exists, so a rename cannot replace one.
            if(file.exists()){
                val prior=JSONObject(file.readText());val expected=JSONObject(String(json,Charsets.UTF_8))
                require(listOf("schema","id","scope","deckId","cardId","fingerprint","grade","question","answer","widgetId").all { prior.opt(it)==expected.opt(it) }) { "This review ID already belongs to another action. The original was kept." }
            } else Os.rename(temporary.absolutePath,file.absolutePath)
            val descriptor=Os.open(dir.absolutePath,OsConstants.O_RDONLY,0)
            try {Os.fsync(descriptor)} finally {Os.close(descriptor)}
        } finally { temporary.delete() }
        true
    }
}
