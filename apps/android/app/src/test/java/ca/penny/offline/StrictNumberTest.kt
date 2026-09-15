package ca.penny.offline

import org.junit.Assert.*
import org.junit.Test

class StrictNumberTest {
    @Test fun jsonNumberGrammarAndLargeMixedDocument() {
        listOf("0","-0","1","-2345","0.1","-0.01","1e3","1E+3","1e-3").forEach {StrictJson.objectFrom("{\"n\":$it}".toByteArray())}
        listOf("+1","01","-01",".1","1.","1e","1e+","1e-","--1","NaN","Infinity","١","1 2","1false").forEach {
            assertTrue(it,runCatching {StrictJson.objectFrom("{\"n\":$it}".toByteArray())}.isFailure)
        }
        val text="{\"values\":["+(0 until 10000).joinToString(",") {"{\"n\":$it,\"s\":\"amount 1e+2\"}"}+"]}"
        assertEquals(10000,StrictJson.objectFrom(text.toByteArray()).getJSONArray("values").length())
    }
}
