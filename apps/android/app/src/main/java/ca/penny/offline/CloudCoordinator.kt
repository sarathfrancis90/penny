package ca.penny.offline

import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import java.util.concurrent.atomic.AtomicLong

data class CloudActivity(val kind: String?=null,val message: String="",val revision: Long=0)
/** One process-wide lease serializes foreground/worker settings commits and local restore.
 * No lock is held across network IO. Epoch invalidation stops every late continuation. */
object CloudCoordinator {
    val lock=Any()
    val epoch=AtomicLong()
    val activity=MutableStateFlow(CloudActivity())
    private var job: Job?=null
    fun cancel() = synchronized(lock) {epoch.incrementAndGet();job?.cancel();job=null;activity.value=CloudActivity(revision=activity.value.revision+1)}
    fun foreground(): Long = synchronized(lock) {cancel();activity.value=activity.value.copy(kind="foreground");epoch.get()}
    fun background(): Long? = synchronized(lock) {if(activity.value.kind!=null) null else {val id=epoch.incrementAndGet();activity.value=activity.value.copy(kind="background",message="Checking automatic backup…");id}}
    fun attach(id: Long,value: Job) = synchronized(lock) {if(epoch.get()==id) job=value else value.cancel()}
    fun check(id: Long) {check(epoch.get()==id) {"cancelled"}}
    fun finish(id: Long) = synchronized(lock) {if(epoch.get()==id) {job=null;activity.value=CloudActivity(revision=activity.value.revision+1)}}
    fun progress(id: Long,message: String) = synchronized(lock) {if(epoch.get()==id) activity.value=activity.value.copy(message=message)}
}
