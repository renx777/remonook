package com.remonook.app

/** Plain-text pages preserve every word; the widget never grades a clipped answer. */
internal object StudyWidgetPages {
    fun split(text: String, limit: Int): List<String> {
        require(limit >= 20)
        if (text.isBlank()) return listOf("No text")
        val pages=mutableListOf<String>(); var start=0
        while(start < text.length) {
            // Newlines consume vertical room even when a page has few characters.
            // Budget them conservatively so a multi-line answer is not clipped.
            var end=start
            var used=0
            while(end<text.length) {
                val point=Character.codePointAt(text,end)
                val count=Character.charCount(point)
                val cost=if(point==10||point==13)20 else count
                if(used+cost>limit && end>start)break
                used+=cost;end+=count
            }
            if(end<text.length) {
                val whitespace=text.lastIndexOf(' ',end-1)
                if(whitespace>start+(end-start)/2) end=whitespace+1
            }
            pages.add(text.substring(start,end));start=end
        }
        return pages
    }
    fun contentBudget(width: Int,height: Int,fontScale: Float): Int {
        val area=(maxOf(140,width)-28)*(maxOf(180,height)-220)
        return (area / (384f*maxOf(1f,fontScale)*maxOf(1f,fontScale))).toInt().coerceIn(20,420)
    }
}
