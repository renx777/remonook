package com.remonook.app

import org.junit.Assert.*
import org.junit.Test

class StudyWidgetPagesTest {
    @Test fun textPagesKeepEveryCharacterAndSurrogatePair() {
        val text=("A useful thought 😀 with a source.\n").repeat(32)
        val pages=StudyWidgetPages.split(text,75)
        assertEquals(text,pages.joinToString(""))
        assertTrue(pages.all {it.length<=75})
        assertTrue(pages.none {Character.isLowSurrogate(it.first())||Character.isHighSurrogate(it.last())})
    }
    @Test fun largeFontReducesTextBudgetAndLargerWidgetAddsRoom() {
        assertTrue(StudyWidgetPages.contentBudget(300,340,1f)>StudyWidgetPages.contentBudget(300,260,1f))
        assertTrue(StudyWidgetPages.contentBudget(300,340,1f)>StudyWidgetPages.contentBudget(300,340,1.6f))
    }
    @Test fun manyShortLinesUseVerticalBudgetWithoutLosingText() {
        val text=("a\n").repeat(30)
        val pages=StudyWidgetPages.split(text,60)
        assertEquals(text,pages.joinToString(""))
        assertTrue(pages.size>5)
        assertTrue(pages.all {it.count {ch->ch=='\n'}<=3})
    }
    @Test fun emptyAndUnbrokenTextRemainReadable() {
        assertEquals(listOf("No text"),StudyWidgetPages.split("",80))
        assertEquals("x".repeat(400),StudyWidgetPages.split("x".repeat(400),80).joinToString(""))
    }
}
