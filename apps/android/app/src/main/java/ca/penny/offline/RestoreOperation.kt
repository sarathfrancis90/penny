package ca.penny.offline

import java.util.concurrent.atomic.AtomicInteger

/** Cancellation linearizes before publication CAS; after it, commit/recovery owns the result. */
class RestoreOperation internal constructor() {
    private val started=java.util.concurrent.atomic.AtomicBoolean()
    internal fun start(): Boolean = started.compareAndSet(false,true)
    private val phase=AtomicInteger(0) // preparing, publishing, cancelled, settled
    internal fun check() {if(phase.get()==2) throw RestoreCancelled();check(phase.get()!=3) {"Restore already settled"}}
    internal fun beginPublication() {if(!phase.compareAndSet(0,1)) throw RestoreCancelled()}
    internal fun finish() {phase.compareAndSet(1,3);phase.compareAndSet(0,3)}
    internal fun cancel(): Boolean {return phase.compareAndSet(0,2) || phase.get() in 2..3}
}
internal class RestoreCancelled : IllegalStateException("Restore cancelled before publication")
