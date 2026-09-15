package ca.penny.offline

import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/** Validate RFC 8259 before Android's intentionally lenient JSONObject decoder.
 * Reject duplicate keys, unpaired surrogates, trailing content and extreme nesting. */
object StrictJson {
    /** Platform JSONObject writers differ in slash escaping. This writer emits
     * identical UTF-8 capacity semantics on Android and the portable writers. */
    fun bytes(json: JSONObject): ByteArray = buildString {
        fun quoted(value: String) {
            Wire.requireUnicode(value)
            append('"')
            value.forEach { c -> when (c) {
                '"' -> append("\\\""); '\\' -> append("\\\\")
                '\b' -> append("\\b"); '\u000c' -> append("\\f"); '\n' -> append("\\n"); '\r' -> append("\\r"); '\t' -> append("\\t")
                else -> if (c.code < 0x20) append("\\u%04x".format(c.code)) else append(c)
            } }
            append('"')
        }
        fun value(item: Any?) {
            when (item) {
                null, JSONObject.NULL -> append("null")
                is String -> quoted(item)
                is Number -> append(item.toString())
                is Boolean -> append(item.toString())
                is JSONObject -> {
                    append('{')
                    item.keys().asSequence().forEachIndexed { index, key -> if (index > 0) append(','); quoted(key); append(':'); value(item.get(key)) }
                    append('}')
                }
                is org.json.JSONArray -> { append('['); for (i in 0 until item.length()) { if (i > 0) append(','); value(item.get(i)) }; append(']') }
                else -> error("Unsupported JSON value")
            }
        }
        value(json)
    }.toByteArray(Charsets.UTF_8)
    fun objectFrom(bytes: ByteArray): JSONObject {
        val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
        Parser(text).validate()
        return JSONObject(text)
    }
    private class Parser(val input: String) {
        var position = 0
        fun validate() { ws(); require(peek() == '{'); value(0); ws(); require(position == input.length) { "Trailing JSON data" } }
        fun peek(): Char = input.getOrNull(position) ?: '\u0000'
        fun ws() { while (peek() in listOf(' ', '\t', '\r', '\n')) position++ }
        fun take(c: Char) { require(peek() == c) { "Invalid JSON" }; position++ }
        fun value(depth: Int) {
            require(depth < 32) { "JSON is nested too deeply" }; ws()
            when (peek()) {
                '{' -> {
                    position++; ws(); val keys = mutableSetOf<String>()
                    if (peek() != '}') while (true) {
                        val name = string(); require(keys.add(name)) { "Duplicate JSON key" }; ws(); take(':'); value(depth + 1); ws()
                        if (peek() != ',') break
                        position++; ws()
                    }
                    take('}')
                }
                '[' -> { position++; ws(); if (peek() != ']') while (true) { value(depth + 1); ws(); if (peek() != ',') break; position++; ws() }; take(']') }
                '"' -> string()
                't' -> literal("true")
                'f' -> literal("false")
                'n' -> literal("null")
                else -> number()
            }
        }
        // Walk only this token. Repeated ICU regex matching on a multi-MiB source
        // copies/scans the source per number on Android and becomes quadratic.
        fun number() {
            if(peek()=='-') position++
            if(peek()=='0') position++ else {
                require(peek() in '1'..'9') { "Invalid JSON value" }
                while(peek() in '0'..'9') position++
            }
            if(peek()=='.') {position++;require(peek() in '0'..'9');while(peek() in '0'..'9') position++}
            if(peek()=='e'||peek()=='E') {
                position++;if(peek()=='+'||peek()=='-') position++
                require(peek() in '0'..'9');while(peek() in '0'..'9') position++
            }
        }
        fun literal(value: String) { require(input.startsWith(value, position)); position += value.length }
        fun string(): String {
            take('"'); val result = StringBuilder()
            while (peek() != '"') {
                require(position < input.length) { "Unterminated JSON text" }
                var c = input[position++]
                if (c == '\\') {
                    require(position < input.length); c = input[position++]
                    c = when (c) {
                        '"', '\\', '/' -> c
                        'b' -> '\b'; 'f' -> '\u000C'; 'n' -> '\n'; 'r' -> '\r'; 't' -> '\t'
                        'u' -> { require(position + 4 <= input.length); val hex = input.substring(position, position + 4); require(hex.all { it in "0123456789abcdefABCDEF" }); position += 4; hex.toInt(16).toChar() }
                        else -> error("Invalid JSON escape")
                    }
                } else require(c.code >= 0x20) { "Unescaped control character" }
                result.append(c)
            }
            position++
            var i = 0
            while (i < result.length) {
                if (Character.isHighSurrogate(result[i])) { require(i + 1 < result.length && Character.isLowSurrogate(result[i + 1])); i += 2 }
                else { require(!Character.isLowSurrogate(result[i])); i++ }
            }
            return result.toString()
        }
    }
}
